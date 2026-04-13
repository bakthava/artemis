package services

import (
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"artemis/internal/models"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptrace"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/quic-go/quic-go/http3"
)

// HTTPClient handles HTTP requests
type HTTPClient struct {
	client *http.Client
}

// NewHTTPClient creates a new HTTP client
func NewHTTPClient() *HTTPClient {
	return &HTTPClient{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// ExecuteRequest executes an HTTP request and returns the response
func (hc *HTTPClient) ExecuteRequest(req *models.Request) (*models.Response, error) {
	logLevel := normalizeLogLevel(req.LogLevel)
	if logLevel == "" {
		logLevel = "info"
	}
	logStart := time.Now()
	selectedProtocol := req.HTTPVersion
	if strings.TrimSpace(selectedProtocol) == "" {
		selectedProtocol = "Auto"
	}

	logs := make([]string, 0, 16)
	appendLog(&logs, logLevel, "info", fmt.Sprintf("Starting %s %s (%s)", req.Method, req.URL, selectedProtocol), logStart, logStart)

	client, cleanup, err := hc.buildClient(req)
	if err != nil {
		appendLog(&logs, logLevel, "error", fmt.Sprintf("Failed to build HTTP client: %v", err), logStart, time.Now())
		return hc.newErrorResponse(req, err, selectedProtocol, logs, time.Now(), time.Now(), nil, 0), err
	}
	if cleanup != nil {
		defer cleanup()
	}

	// Build the request
	httpReq, err := hc.buildRequest(req)
	if err != nil {
		appendLog(&logs, logLevel, "error", fmt.Sprintf("Failed to build request: %v", err), logStart, time.Now())
		return hc.newErrorResponse(req, err, selectedProtocol, logs, time.Now(), time.Now(), nil, 0), err
	}
	bytesSent := estimateRequestBytes(httpReq)

	timings := &requestTimings{}
	httpReq = httpReq.WithContext(httptrace.WithClientTrace(httpReq.Context(), &httptrace.ClientTrace{
		DNSStart: func(_ httptrace.DNSStartInfo) {
			now := time.Now()
			timings.dnsStart = now
			appendLog(&logs, logLevel, "trace", "DNS lookup started", logStart, now)
		},
		DNSDone: func(info httptrace.DNSDoneInfo) {
			now := time.Now()
			timings.dnsDone = now
			if info.Err != nil {
				appendLog(&logs, logLevel, "debug", fmt.Sprintf("DNS lookup failed: %v", info.Err), logStart, now)
				return
			}
			appendLog(&logs, logLevel, "trace", "DNS lookup completed", logStart, now)
		},
		ConnectStart: func(_, _ string) {
			now := time.Now()
			timings.connectStart = time.Now()
			appendLog(&logs, logLevel, "debug", "TCP connection started", logStart, now)
		},
		ConnectDone: func(_, _ string, err error) {
			now := time.Now()
			timings.connectDone = time.Now()
			if err != nil {
				appendLog(&logs, logLevel, "error", fmt.Sprintf("TCP connection failed: %v", err), logStart, now)
				return
			}
			appendLog(&logs, logLevel, "debug", "TCP connection established", logStart, now)
		},
		TLSHandshakeStart: func() {
			now := time.Now()
			timings.tlsStart = time.Now()
			appendLog(&logs, logLevel, "trace", "TLS handshake started", logStart, now)
		},
		TLSHandshakeDone: func(_ tls.ConnectionState, err error) {
			now := time.Now()
			timings.tlsDone = time.Now()
			if err != nil {
				appendLog(&logs, logLevel, "error", fmt.Sprintf("TLS handshake failed: %v", err), logStart, now)
				return
			}
			appendLog(&logs, logLevel, "trace", "TLS handshake completed", logStart, now)
		},
		WroteRequest: func(info httptrace.WroteRequestInfo) {
			now := time.Now()
			timings.wroteRequest = now
			if info.Err != nil {
				appendLog(&logs, logLevel, "error", fmt.Sprintf("Failed to write request: %v", info.Err), logStart, now)
				return
			}
			appendLog(&logs, logLevel, "debug", "Request bytes sent", logStart, now)
		},
		GotFirstResponseByte: func() {
			now := time.Now()
			timings.firstByte = time.Now()
			appendLog(&logs, logLevel, "debug", "Received first response byte", logStart, now)
		},
	}))

	if strings.EqualFold(strings.TrimSpace(req.HTTPVersion), "HTTP/3") && !strings.EqualFold(httpReq.URL.Scheme, "https") {
		err = fmt.Errorf("HTTP/3 requires an https URL")
		appendLog(&logs, logLevel, "error", err.Error(), logStart, time.Now())
		return hc.newErrorResponse(req, err, selectedProtocol, logs, time.Now(), time.Now(), timings, bytesSent), err
	}

	if strings.EqualFold(strings.TrimSpace(req.HTTPVersion), "HTTP/2") && !strings.EqualFold(httpReq.URL.Scheme, "https") {
		err = fmt.Errorf("HTTP/2 requires an https URL for strict protocol mode")
		appendLog(&logs, logLevel, "error", err.Error(), logStart, time.Now())
		return hc.newErrorResponse(req, err, selectedProtocol, logs, time.Now(), time.Now(), timings, bytesSent), err
	}

	// Execute the request
	startTime := time.Now()
	httpResp, err := client.Do(httpReq)
	if err != nil {
		execErr := fmt.Errorf("request failed: %w", err)
		appendLog(&logs, logLevel, "error", execErr.Error(), logStart, time.Now())
		return hc.newErrorResponse(req, execErr, selectedProtocol, logs, startTime, time.Now(), timings, bytesSent), execErr
	}
	defer httpResp.Body.Close()

	// Read response body
	bodyBytes, err := io.ReadAll(httpResp.Body)
	if err != nil {
		readErr := fmt.Errorf("failed to read response body: %w", err)
		appendLog(&logs, logLevel, "error", readErr.Error(), logStart, time.Now())
		return hc.newErrorResponse(req, readErr, httpResp.Proto, logs, startTime, time.Now(), timings, bytesSent), readErr
	}
	endTime := time.Now()
	bytesReceived := estimateResponseBytes(httpResp, int64(len(bodyBytes)))

	appendLog(&logs, logLevel, "info", fmt.Sprintf("Response received with status %s", httpResp.Status), logStart, endTime)
	appendLog(&logs, logLevel, "debug", fmt.Sprintf("Negotiated protocol: %s", httpResp.Proto), logStart, endTime)

	if err := validateSelectedProtocol(selectedProtocol, httpResp.Proto); err != nil {
		appendLog(&logs, logLevel, "error", err.Error(), logStart, time.Now())
		return hc.newErrorResponse(req, err, httpResp.Proto, logs, startTime, endTime, timings, bytesSent), err
	}

	// Build response model
	response := &models.Response{
		StatusCode:               httpResp.StatusCode,
		Status:                   httpResp.Status,
		Headers:                  hc.headerMapToStringMap(httpResp.Header),
		Body:                     string(bodyBytes),
		Size:                     int64(len(bodyBytes)),
		Time:                     endTime.Sub(startTime).Milliseconds(),
		ConnectionTime:           calculateConnectionTime(timings),
		NetworkTime:              calculateNetworkTime(startTime, timings, endTime),
		ResponseTime:             calculateResponseTime(timings, endTime),
		PrepareTime:              durationMs(logStart, startTime),
		SocketInitializationTime: calculateSocketInitializationTime(logStart, timings),
		DNSLookupTime:            durationMs(timings.dnsStart, timings.dnsDone),
		TCPHandshakeTime:         durationMs(timings.connectStart, timings.connectDone),
		WaitingTime:              calculateWaitingTime(startTime, timings),
		DownloadTime:             calculateDownloadTime(timings, endTime),
		ProcessTime:              durationMs(endTime, time.Now()),
		BytesSent:                bytesSent,
		BytesReceived:            bytesReceived,
		Protocol:                 httpResp.Proto,
		LogLevel:                 logLevel,
		Logs:                     logs,
		Timestamp:                time.Now().Unix(),
	}

	return response, nil
}

type requestTimings struct {
	dnsStart     time.Time
	dnsDone      time.Time
	connectStart time.Time
	connectDone  time.Time
	tlsStart     time.Time
	tlsDone      time.Time
	wroteRequest time.Time
	firstByte    time.Time
}

func normalizeLogLevel(level string) string {
	v := strings.ToLower(strings.TrimSpace(level))
	switch v {
	case "error", "info", "debug", "trace":
		return v
	default:
		return ""
	}
}

func logPriority(level string) int {
	switch level {
	case "error":
		return 0
	case "info":
		return 1
	case "debug":
		return 2
	case "trace":
		return 3
	default:
		return 1
	}
}

func appendLog(logs *[]string, reqLevel, eventLevel, message string, start, at time.Time) {
	if logPriority(reqLevel) < logPriority(eventLevel) {
		return
	}
	if at.IsZero() {
		at = time.Now()
	}
	var elapsed int64
	if !start.IsZero() {
		elapsed = at.Sub(start).Milliseconds()
	}
	ts := at.Local().Format("2006-01-02 15:04:05.000")
	*logs = append(*logs, fmt.Sprintf("%s [%s] %s %dms", ts, strings.ToUpper(eventLevel), message, elapsed))
}

func calculateConnectionTime(t *requestTimings) int64 {
	if t == nil {
		return 0
	}
	if !t.connectStart.IsZero() {
		if !t.tlsDone.IsZero() {
			return t.tlsDone.Sub(t.connectStart).Milliseconds()
		}
		if !t.connectDone.IsZero() {
			return t.connectDone.Sub(t.connectStart).Milliseconds()
		}
	}
	return 0
}

func calculateNetworkTime(start time.Time, t *requestTimings, end time.Time) int64 {
	if t != nil && !t.firstByte.IsZero() {
		return t.firstByte.Sub(start).Milliseconds()
	}
	if !end.IsZero() {
		return end.Sub(start).Milliseconds()
	}
	return 0
}

func calculateResponseTime(t *requestTimings, end time.Time) int64 {
	if t == nil || t.firstByte.IsZero() || end.IsZero() {
		return 0
	}
	return end.Sub(t.firstByte).Milliseconds()
}

func (hc *HTTPClient) newErrorResponse(req *models.Request, err error, protocol string, logs []string, startTime, endTime time.Time, timings *requestTimings, bytesSent int64) *models.Response {
	logLevel := normalizeLogLevel(req.LogLevel)
	if logLevel == "" {
		logLevel = "info"
	}

	if strings.TrimSpace(protocol) == "" {
		protocol = req.HTTPVersion
	}

	body := err.Error()
	return &models.Response{
		StatusCode:               0,
		Status:                   "Error",
		Headers:                  map[string]string{},
		Body:                     body,
		Size:                     int64(len(body)),
		Time:                     endTime.Sub(startTime).Milliseconds(),
		ConnectionTime:           calculateConnectionTime(timings),
		NetworkTime:              calculateNetworkTime(startTime, timings, endTime),
		ResponseTime:             calculateResponseTime(timings, endTime),
		PrepareTime:              durationMs(startTime, startTime),
		SocketInitializationTime: calculateSocketInitializationTime(startTime, timings),
		DNSLookupTime:            durationMs(timings.dnsStart, timings.dnsDone),
		TCPHandshakeTime:         durationMs(timings.connectStart, timings.connectDone),
		WaitingTime:              calculateWaitingTime(startTime, timings),
		DownloadTime:             calculateDownloadTime(timings, endTime),
		ProcessTime:              durationMs(endTime, time.Now()),
		BytesSent:                bytesSent,
		BytesReceived:            0,
		Protocol:                 protocol,
		LogLevel:                 logLevel,
		Logs:                     logs,
		Timestamp:                time.Now().Unix(),
	}
}

func validateSelectedProtocol(selectedProtocol, actualProtocol string) error {
	selected := strings.ToUpper(strings.TrimSpace(selectedProtocol))
	actual := strings.ToUpper(strings.TrimSpace(actualProtocol))

	if selected == "" || selected == "AUTO" {
		return nil
	}

	switch selected {
	case "HTTP/1.1":
		if !strings.HasPrefix(actual, "HTTP/1.") {
			return fmt.Errorf("protocol mismatch: selected HTTP/1.x but server used %s", actualProtocol)
		}
	case "HTTP/2":
		if !strings.HasPrefix(actual, "HTTP/2") {
			return fmt.Errorf("protocol mismatch: selected HTTP/2 but server used %s", actualProtocol)
		}
	case "HTTP/3":
		if !strings.HasPrefix(actual, "HTTP/3") {
			return fmt.Errorf("protocol mismatch: selected HTTP/3 but server used %s", actualProtocol)
		}
	}

	return nil
}

func estimateRequestBytes(req *http.Request) int64 {
	if req == nil || req.URL == nil {
		return 0
	}

	requestURI := req.URL.RequestURI()
	if requestURI == "" {
		requestURI = "/"
	}

	total := int64(len(req.Method) + 1 + len(requestURI) + len(" HTTP/1.1\r\n"))

	host := req.Host
	if host == "" {
		host = req.URL.Host
	}
	if host != "" {
		total += int64(len("Host: ") + len(host) + len("\r\n"))
	}

	for key, values := range req.Header {
		for _, value := range values {
			total += int64(len(key) + len(": ") + len(value) + len("\r\n"))
		}
	}

	total += int64(len("\r\n"))
	if req.ContentLength > 0 {
		total += req.ContentLength
	}

	return total
}

func estimateResponseBytes(resp *http.Response, bodyLen int64) int64 {
	if resp == nil {
		return bodyLen
	}

	total := int64(len(resp.Proto) + 1 + len(resp.Status) + len("\r\n"))
	for key, values := range resp.Header {
		for _, value := range values {
			total += int64(len(key) + len(": ") + len(value) + len("\r\n"))
		}
	}

	total += int64(len("\r\n"))
	total += bodyLen
	return total
}

func durationMs(start, end time.Time) float64 {
	if start.IsZero() || end.IsZero() || end.Before(start) {
		return 0
	}
	return float64(end.Sub(start).Microseconds()) / 1000.0
}

func calculateSocketInitializationTime(globalStart time.Time, t *requestTimings) float64 {
	if t == nil || t.connectStart.IsZero() {
		return 0
	}

	if !t.dnsDone.IsZero() {
		return durationMs(t.dnsDone, t.connectStart)
	}

	if !globalStart.IsZero() {
		return durationMs(globalStart, t.connectStart)
	}

	return 0
}

func calculateWaitingTime(requestStart time.Time, t *requestTimings) float64 {
	if t == nil || t.firstByte.IsZero() {
		return 0
	}

	if !t.wroteRequest.IsZero() {
		return durationMs(t.wroteRequest, t.firstByte)
	}

	return durationMs(requestStart, t.firstByte)
}

func calculateDownloadTime(t *requestTimings, end time.Time) float64 {
	if t == nil || t.firstByte.IsZero() {
		return 0
	}
	return durationMs(t.firstByte, end)
}

func (hc *HTTPClient) buildClient(req *models.Request) (*http.Client, func(), error) {
	timeout := 30 * time.Second
	if req.Timeout > 0 {
		timeout = time.Duration(req.Timeout) * time.Second
	}

	protocol := strings.ToUpper(strings.TrimSpace(req.HTTPVersion))
	if protocol == "" {
		protocol = "AUTO"
	}

	// Load client certificates if provided (from base64-encoded strings)
	var clientCerts []tls.Certificate
	var certCleanup func()
	
	if req.CertificateFile != "" && req.KeyFile != "" {
		cert, cleanup, err := hc.loadClientCertificateFromBase64(req.CertificateFile, req.KeyFile)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to load client certificate: %w", err)
		}
		clientCerts = []tls.Certificate{cert}
		certCleanup = cleanup
	}

	if protocol == "HTTP/3" {
		transport := &http3.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: !req.VerifySSL,
				Certificates:       clientCerts,
				NextProtos:         []string{http3.NextProtoH3},
				PreferServerCipherSuites: req.UseServerCipherSuite,
			},
		}

		hc.applyTLSProtocols(transport.TLSClientConfig, req.DisabledTLSProtocols)
		hc.applyCipherSuites(transport.TLSClientConfig, req.CipherSuites)

		client := &http.Client{
			Timeout:   timeout,
			Transport: transport,
		}

		hc.applyRedirectPolicy(client, req)

		return client, func() {
			if certCleanup != nil {
				certCleanup()
			}
			_ = transport.Close()
		}, nil
	}

	tlsConfig := &tls.Config{
		InsecureSkipVerify: !req.VerifySSL,
		Certificates:       clientCerts,
		PreferServerCipherSuites: req.UseServerCipherSuite,
	}

	hc.applyTLSProtocols(tlsConfig, req.DisabledTLSProtocols)
	hc.applyCipherSuites(tlsConfig, req.CipherSuites)

	transport := &http.Transport{
		TLSClientConfig: tlsConfig,
	}

	if protocol == "HTTP/1.1" {
		transport.ForceAttemptHTTP2 = false
		transport.TLSNextProto = map[string]func(string, *tls.Conn) http.RoundTripper{}
	} else if protocol == "HTTP/2" || protocol == "AUTO" {
		transport.ForceAttemptHTTP2 = true
	}

	client := &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}

	if !req.DisableCookieJar {
		if jar, err := cookiejar.New(nil); err == nil {
			client.Jar = jar
		}
	}

	if !req.FollowRedirects {
		client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		}
		return client, certCleanup, nil
	}

	hc.applyRedirectPolicy(client, req)

	return client, certCleanup, nil
}

func (hc *HTTPClient) applyRedirectPolicy(client *http.Client, req *models.Request) {
	if !req.FollowRedirects {
		client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		}
		return
	}

	maxRedirects := req.MaxRedirects
	if maxRedirects <= 0 {
		maxRedirects = 10
	}

	client.CheckRedirect = func(redirectReq *http.Request, via []*http.Request) error {
		if len(via) >= maxRedirects {
			return fmt.Errorf("stopped after %d redirects", maxRedirects)
		}

		prevReq := via[len(via)-1]

		if req.RemoveRefererOnRedirect {
			redirectReq.Header.Del("Referer")
		}

		if !req.FollowAuthHeader && !sameHost(prevReq.URL, redirectReq.URL) {
			redirectReq.Header.Del("Authorization")
		}

		if req.FollowOriginalMethod {
			redirectReq.Method = prevReq.Method
		}

		return nil
	}
}

// buildRequest constructs an *http.Request from a models.Request
func (hc *HTTPClient) buildRequest(req *models.Request) (*http.Request, error) {
	// Build URL with query parameters
	requestURL := req.URL
	if len(req.QueryParams) > 0 {
		if req.EncodeURLAutomatically {
			parsedURL, err := url.Parse(requestURL)
			if err != nil {
				return nil, fmt.Errorf("invalid request URL: %w", err)
			}

			values := parsedURL.Query()
			for key, value := range req.QueryParams {
				values.Set(key, value)
			}
			parsedURL.RawQuery = values.Encode()
			requestURL = parsedURL.String()
		} else {
			params := []string{}
			for key, value := range req.QueryParams {
				params = append(params, fmt.Sprintf("%s=%s", key, value))
			}
			if strings.Contains(requestURL, "?") {
				requestURL += "&" + strings.Join(params, "&")
			} else {
				requestURL += "?" + strings.Join(params, "&")
			}
		}
	}

	// Create HTTP request
	httpReq, err := http.NewRequest(req.Method, requestURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add headers
	for key, value := range req.Headers {
		httpReq.Header.Set(key, value)
	}

	// Add authentication
	if req.Auth != nil {
		hc.addAuth(httpReq, req.Auth)
	}

	// Add body if present
	if req.Body != "" {
		httpReq.Body = io.NopCloser(strings.NewReader(req.Body))
		httpReq.ContentLength = int64(len(req.Body))
	}

	return httpReq, nil
}

func sameHost(a, b *url.URL) bool {
	if a == nil || b == nil {
		return false
	}
	return strings.EqualFold(a.Hostname(), b.Hostname())
}

func (hc *HTTPClient) applyTLSProtocols(cfg *tls.Config, disabled []string) {
	disabledSet := map[string]bool{}
	for _, version := range disabled {
		disabledSet[strings.ToUpper(strings.TrimSpace(version))] = true
	}

	enabled := []uint16{}
	versionMap := map[string]uint16{
		"TLSV1":   tls.VersionTLS10,
		"TLSV1.0": tls.VersionTLS10,
		"TLSV1.1": tls.VersionTLS11,
		"TLSV1.2": tls.VersionTLS12,
		"TLSV1.3": tls.VersionTLS13,
	}

	ordered := []string{"TLSV1", "TLSV1.1", "TLSV1.2", "TLSV1.3"}
	for _, name := range ordered {
		if !disabledSet[name] {
			enabled = append(enabled, versionMap[name])
		}
	}

	if len(enabled) == 0 {
		return
	}

	cfg.MinVersion = enabled[0]
	cfg.MaxVersion = enabled[len(enabled)-1]
}

func (hc *HTTPClient) applyCipherSuites(cfg *tls.Config, suites []string) {
	if len(suites) == 0 {
		return
	}

	cipherMap := map[string]uint16{
		"TLS_RSA_WITH_AES_128_CBC_SHA":                  tls.TLS_RSA_WITH_AES_128_CBC_SHA,
		"TLS_RSA_WITH_AES_256_CBC_SHA":                  tls.TLS_RSA_WITH_AES_256_CBC_SHA,
		"TLS_RSA_WITH_AES_128_GCM_SHA256":               tls.TLS_RSA_WITH_AES_128_GCM_SHA256,
		"TLS_RSA_WITH_AES_256_GCM_SHA384":               tls.TLS_RSA_WITH_AES_256_GCM_SHA384,
		"TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA":            tls.TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA,
		"TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA":            tls.TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA,
		"TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256":         tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
		"TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384":         tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
		"TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256":       tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
		"TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384":       tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
		"TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256":   tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,
		"TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256": tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,
	}

	resolved := make([]uint16, 0, len(suites))
	for _, suite := range suites {
		name := strings.ToUpper(strings.TrimSpace(suite))
		if id, ok := cipherMap[name]; ok {
			resolved = append(resolved, id)
		}
	}

	if len(resolved) > 0 {
		cfg.CipherSuites = resolved
	}
}

// loadClientCertificateFromBase64 loads a client certificate from base64-encoded strings
// Returns the certificate and a cleanup function to remove temporary files
func (hc *HTTPClient) loadClientCertificateFromBase64(certBase64, keyBase64 string) (tls.Certificate, func(), error) {
	var cert tls.Certificate
	
	// Decode certificate
	certData, err := base64.StdEncoding.DecodeString(certBase64)
	if err != nil {
		return cert, nil, fmt.Errorf("failed to decode certificate: %w", err)
	}
	
	// Decode key
	keyData, err := base64.StdEncoding.DecodeString(keyBase64)
	if err != nil {
		return cert, nil, fmt.Errorf("failed to decode key: %w", err)
	}
	
	// Create temporary files
	certFile, err := os.CreateTemp("", "cert-*.pem")
	if err != nil {
		return cert, nil, fmt.Errorf("failed to create temp certificate file: %w", err)
	}
	certPath := certFile.Name()
	defer certFile.Close()
	
	if _, err := certFile.Write(certData); err != nil {
		os.Remove(certPath)
		return cert, nil, fmt.Errorf("failed to write certificate: %w", err)
	}
	
	keyFile, err := os.CreateTemp("", "key-*.pem")
	if err != nil {
		os.Remove(certPath)
		return cert, nil, fmt.Errorf("failed to create temp key file: %w", err)
	}
	keyPath := keyFile.Name()
	defer keyFile.Close()
	
	if _, err := keyFile.Write(keyData); err != nil {
		os.Remove(certPath)
		os.Remove(keyPath)
		return cert, nil, fmt.Errorf("failed to write key: %w", err)
	}
	
	// Load the certificate pair
	cert, err = tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		os.Remove(certPath)
		os.Remove(keyPath)
		return cert, nil, fmt.Errorf("failed to load X509 key pair: %w", err)
	}
	
	// Return cleanup function
	cleanup := func() {
		os.Remove(certPath)
		os.Remove(keyPath)
	}
	
	return cert, cleanup, nil
}

// addAuth adds authentication header to the request
func (hc *HTTPClient) addAuth(req *http.Request, auth *models.Auth) {
	switch auth.Type {
	case "basic":
		credentials := auth.Username + ":" + auth.Password
		encoded := base64.StdEncoding.EncodeToString([]byte(credentials))
		req.Header.Set("Authorization", "Basic "+encoded)
	case "bearer":
		req.Header.Set("Authorization", "Bearer "+auth.Token)
	case "oauth2":
		req.Header.Set("Authorization", "Bearer "+auth.Token)
	}
}

// headerMapToStringMap converts http.Header to map[string]string
func (hc *HTTPClient) headerMapToStringMap(headers http.Header) map[string]string {
	result := make(map[string]string)
	for key, values := range headers {
		if len(values) > 0 {
			result[key] = values[0]
		}
	}
	return result
}

// FormatResponseBody formats response body for display
func FormatResponseBody(body string) string {
	// Try to parse as JSON and format
	var jsonData interface{}
	if err := json.Unmarshal([]byte(body), &jsonData); err == nil {
		// It's valid JSON, format it
		formatted, _ := json.MarshalIndent(jsonData, "", "  ")
		return string(formatted)
	}
	// Not JSON, return as-is
	return body
}
