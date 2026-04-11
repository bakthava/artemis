package models

// Request represents an HTTP request
type Request struct {
	ID                      string            `json:"id"`
	Name                    string            `json:"name"`
	Method                  string            `json:"method"`
	URL                     string            `json:"url"`
	Headers                 map[string]string `json:"headers"`
	QueryParams             map[string]string `json:"queryParams"`
	Body                    string            `json:"body"`
	BodyType                string            `json:"bodyType"` // json, xml, form, text
	Auth                    *Auth             `json:"auth"`
	PreScript               string            `json:"preScript"`
	PostScript              string            `json:"postScript"`
	Timeout                 int               `json:"timeout"`     // in seconds
	HTTPVersion             string            `json:"httpVersion"` // Auto, HTTP/1.1, HTTP/2, HTTP/3
	VerifySSL               bool              `json:"verifySSL"`
	FollowRedirects         bool              `json:"followRedirects"`
	FollowOriginalMethod    bool              `json:"followOriginalMethod"`
	FollowAuthHeader        bool              `json:"followAuthHeader"`
	RemoveRefererOnRedirect bool              `json:"removeRefererOnRedirect"`
	StrictHTTPParser        bool              `json:"strictHTTPParser"`
	EncodeURLAutomatically  bool              `json:"encodeURLAutomatically"`
	DisableCookieJar        bool              `json:"disableCookieJar"`
	UseServerCipherSuite    bool              `json:"useServerCipherSuite"`
	MaxRedirects            int               `json:"maxRedirects"`         // default 10
	DisabledTLSProtocols    []string          `json:"disabledTLSProtocols"` // TLSv1.2, TLSv1.3, etc
	CipherSuites            []string          `json:"cipherSuites"`         // custom cipher suite order
	LogLevel                string            `json:"logLevel"`             // error, info, debug, trace
}

// Auth represents authentication settings
type Auth struct {
	Type     string `json:"type"` // none, basic, bearer, oauth2
	Username string `json:"username"`
	Password string `json:"password"`
	Token    string `json:"token"`
}

// Response represents an HTTP response
type Response struct {
	StatusCode               int               `json:"statusCode"`
	Status                   string            `json:"status"`
	Headers                  map[string]string `json:"headers"`
	Body                     string            `json:"body"`
	Size                     int64             `json:"size"`
	Time                     int64             `json:"time"` // response time in milliseconds
	ConnectionTime           int64             `json:"connectionTime"`
	NetworkTime              int64             `json:"networkTime"`
	ResponseTime             int64             `json:"responseTime"`
	PrepareTime              float64           `json:"prepareTime"`
	SocketInitializationTime float64           `json:"socketInitializationTime"`
	DNSLookupTime            float64           `json:"dnsLookupTime"`
	TCPHandshakeTime         float64           `json:"tcpHandshakeTime"`
	WaitingTime              float64           `json:"waitingTime"`
	DownloadTime             float64           `json:"downloadTime"`
	ProcessTime              float64           `json:"processTime"`
	BytesSent                int64             `json:"bytesSent"`
	BytesReceived            int64             `json:"bytesReceived"`
	Protocol                 string            `json:"protocol"`
	LogLevel                 string            `json:"logLevel"`
	Logs                     []string          `json:"logs"`
	Timestamp                int64             `json:"timestamp"`
}

// Collection groups related requests
type Collection struct {
	ID       string     `json:"id"`
	Name     string     `json:"name"`
	Requests []*Request `json:"requests"`
}

// HistoryEntry represents a past request
type HistoryEntry struct {
	ID        string    `json:"id"`
	Request   *Request  `json:"request"`
	Response  *Response `json:"response"`
	Timestamp int64     `json:"timestamp"`
}

// Environment contains environment variables
type Environment struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Variables map[string]string `json:"variables"`
	Active    bool              `json:"active"`
}
