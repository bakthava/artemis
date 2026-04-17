package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	keystore "github.com/pavlo-v-chernykh/keystore-go/v4"
)

const (
	defaultPort = 8443
	jksPassword = "artemis123"
	outputDir   = "testcerts"
)

func main() {
	port := defaultPort
	if len(os.Args) > 1 {
		fmt.Sscanf(os.Args[1], "%d", &port)
	}

	// Create output directory
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		log.Fatalf("Failed to create output directory: %v", err)
	}

	fmt.Println("=== Artemis mTLS Test Server ===")
	fmt.Println()

	// Step 1: Generate CA
	fmt.Println("[1/4] Generating CA certificate...")
	caCert, caKey, caCertPEM, err := generateCA()
	if err != nil {
		log.Fatalf("Failed to generate CA: %v", err)
	}
	caCertPath := filepath.Join(outputDir, "ca-cert.pem")
	if err := os.WriteFile(caCertPath, caCertPEM, 0600); err != nil {
		log.Fatalf("Failed to write CA cert: %v", err)
	}

	// Step 2: Generate server cert signed by CA
	fmt.Println("[2/4] Generating server certificate...")
	serverCert, err := generateSignedCert("localhost", caCert, caKey, true)
	if err != nil {
		log.Fatalf("Failed to generate server cert: %v", err)
	}

	// Step 3: Generate client cert signed by CA
	fmt.Println("[3/4] Generating client certificate...")
	clientCert, clientCertDER, clientKeyDER, err := generateSignedCertWithRaw("artemis-client", caCert, caKey, false)
	if err != nil {
		log.Fatalf("Failed to generate client cert: %v", err)
	}
	_ = clientCert

	// Write client cert + key as PEM for reference
	clientCertPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: clientCertDER})
	clientKeyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: clientKeyDER})
	os.WriteFile(filepath.Join(outputDir, "client-cert.pem"), clientCertPEM, 0600)
	os.WriteFile(filepath.Join(outputDir, "client-key.pem"), clientKeyPEM, 0600)

	// Step 4: Build JKS keystore from client cert
	fmt.Println("[4/4] Building JKS keystore...")
	jksPath := filepath.Join(outputDir, "client.jks")
	if err := buildJKS(clientCertDER, clientKeyDER, jksPath, jksPassword); err != nil {
		log.Fatalf("Failed to build JKS: %v", err)
	}

	fmt.Println()
	fmt.Println("=== Generated Files ===")
	fmt.Printf("  CA Certificate:     %s\n", caCertPath)
	fmt.Printf("  Client Certificate: %s\n", filepath.Join(outputDir, "client-cert.pem"))
	fmt.Printf("  Client Key:         %s\n", filepath.Join(outputDir, "client-key.pem"))
	fmt.Printf("  Client JKS:         %s\n", jksPath)
	fmt.Printf("  JKS Password:       %s\n", jksPassword)
	fmt.Println()

	// Build mTLS server config - VerifyClientCertIfGiven allows both with and without client cert
	caPool := x509.NewCertPool()
	caPool.AddCert(caCert)

	serverTLSConfig := &tls.Config{
		Certificates: []tls.Certificate{*serverCert},
		ClientAuth:   tls.VerifyClientCertIfGiven,
		ClientCAs:    caPool,
		MinVersion:   tls.VersionTLS12,
	}

	// Create HTTP handler
	mux := http.NewServeMux()

	// Main endpoint - accepts with or without client cert
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		clientInfo := map[string]interface{}{
			"status":        "ok",
			"message":       "Connection successful!",
			"time":          time.Now().Format(time.RFC3339),
			"method":        r.Method,
			"path":          r.URL.Path,
			"hasMTLS":       false,
			"clientPresent": false,
		}

		if r.TLS != nil {
			clientInfo["tls_version"] = getTLSVersionString(r.TLS.Version)
			clientInfo["cipher_suite"] = getTLSSuiteName(r.TLS.CipherSuite)

			if len(r.TLS.PeerCertificates) > 0 {
				clientInfo["hasMTLS"] = true
				clientInfo["clientPresent"] = true
				peer := r.TLS.PeerCertificates[0]
				clientInfo["client_subject"] = peer.Subject.String()
				clientInfo["client_issuer"] = peer.Issuer.String()
				clientInfo["client_serial"] = peer.SerialNumber.String()
				clientInfo["message"] = "mTLS 2-way SSL successful!"
			} else {
				clientInfo["message"] = "TLS connection successful (no client certificate)"
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(clientInfo)
	})

	// Strict mTLS endpoint - requires client certificate
	mux.HandleFunc("/mtls-required", func(w http.ResponseWriter, r *http.Request) {
		if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Client certificate required",
				"hint":  "This endpoint requires mTLS authentication",
			})
			return
		}

		clientInfo := map[string]interface{}{
			"status":  "ok",
			"message": "mTLS endpoint requires client certificate - authenticated!",
			"time":    time.Now().Format(time.RFC3339),
		}

		if len(r.TLS.PeerCertificates) > 0 {
			peer := r.TLS.PeerCertificates[0]
			clientInfo["client_subject"] = peer.Subject.String()
			clientInfo["client_issuer"] = peer.Issuer.String()
			clientInfo["client_serial"] = peer.SerialNumber.String()
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(clientInfo)
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
	})

	server := &http.Server{
		Addr:      fmt.Sprintf(":%d", port),
		Handler:   mux,
		TLSConfig: serverTLSConfig,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		fmt.Println("\nShutting down...")
		server.Close()
	}()

	fmt.Printf("=== mTLS Test Server listening on https://localhost:%d ===\n", port)
	fmt.Println()
	fmt.Println("Available Endpoints:")
	fmt.Printf("  GET https://localhost:%d/               - Works with OR without client cert\n", port)
	fmt.Printf("  GET https://localhost:%d/mtls-required   - Requires client certificate (mTLS)\n", port)
	fmt.Printf("  GET https://localhost:%d/health          - Health check\n", port)
	fmt.Println()
	fmt.Println("To test with Artemis (TLS with client cert):")
	fmt.Printf("  1. Import '%s' in Settings > Certificates\n", jksPath)
	fmt.Printf("  2. Enter password: %s\n", jksPassword)
	fmt.Printf("  3. Send a request to https://localhost:%d\n", port)
	fmt.Println("  4. Disable SSL verification (self-signed CA)")
	fmt.Println()
	fmt.Println("To test without client cert:")
	fmt.Printf("  1. Send a request to https://localhost:%d without importing certificates\n", port)
	fmt.Println("  2. Disable SSL verification (self-signed CA)")
	fmt.Println()
	fmt.Println("Press Ctrl+C to stop.")
	fmt.Println()

	if err := server.ListenAndServeTLS("", ""); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}

func generateCA() (*x509.Certificate, *rsa.PrivateKey, []byte, error) {
	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, nil, err
	}

	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))

	caTemplate := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   "Artemis Test CA",
			Organization: []string{"Artemis"},
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            2,
	}

	caCertDER, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		return nil, nil, nil, err
	}

	caCert, err := x509.ParseCertificate(caCertDER)
	if err != nil {
		return nil, nil, nil, err
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caCertDER})
	return caCert, caKey, certPEM, nil
}

func generateSignedCert(cn string, caCert *x509.Certificate, caKey *rsa.PrivateKey, isServer bool) (*tls.Certificate, error) {
	_, certDER, keyDER, err := generateSignedCertRaw(cn, caCert, caKey, isServer)
	if err != nil {
		return nil, err
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: keyDER})

	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, err
	}
	return &tlsCert, nil
}

func generateSignedCertWithRaw(cn string, caCert *x509.Certificate, caKey *rsa.PrivateKey, isServer bool) (*tls.Certificate, []byte, []byte, error) {
	key, certDER, keyDER, err := generateSignedCertRaw(cn, caCert, caKey, isServer)
	if err != nil {
		return nil, nil, nil, err
	}
	_ = key
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: keyDER})
	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, nil, nil, err
	}
	return &tlsCert, certDER, keyDER, nil
}

func generateSignedCertRaw(cn string, caCert *x509.Certificate, caKey *rsa.PrivateKey, isServer bool) (*rsa.PrivateKey, []byte, []byte, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, nil, err
	}

	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))

	extKeyUsage := []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}
	if isServer {
		extKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}
	}

	template := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   cn,
			Organization: []string{"Artemis"},
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           extKeyUsage,
		BasicConstraintsValid: true,
	}

	if isServer {
		template.IPAddresses = []net.IP{net.ParseIP("127.0.0.1")}
		template.DNSNames = []string{cn, "localhost", "127.0.0.1"}
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, caCert, &key.PublicKey, caKey)
	if err != nil {
		return nil, nil, nil, err
	}

	keyDER := x509.MarshalPKCS1PrivateKey(key)
	return key, certDER, keyDER, nil
}

func buildJKS(certDER, keyPKCS1 []byte, jksPath, password string) error {
	// Convert PKCS1 key to PKCS8 for JKS
	rsaKey, err := x509.ParsePKCS1PrivateKey(keyPKCS1)
	if err != nil {
		return fmt.Errorf("parse PKCS1 key: %w", err)
	}
	pkcs8Key, err := x509.MarshalPKCS8PrivateKey(rsaKey)
	if err != nil {
		return fmt.Errorf("marshal to PKCS8: %w", err)
	}

	ks := keystore.New()
	entry := keystore.PrivateKeyEntry{
		CreationTime: time.Now(),
		PrivateKey:   pkcs8Key,
		CertificateChain: []keystore.Certificate{
			{
				Type:    "X.509",
				Content: certDER,
			},
		},
	}
	if err := ks.SetPrivateKeyEntry("client", entry, []byte(password)); err != nil {
		return fmt.Errorf("set private key entry: %w", err)
	}

	f, err := os.Create(jksPath)
	if err != nil {
		return fmt.Errorf("create JKS file: %w", err)
	}
	defer f.Close()

	return ks.Store(f, []byte(password))
}

// getTLSVersionString returns human-readable TLS version
func getTLSVersionString(version uint16) string {
	switch version {
	case tls.VersionTLS10:
		return "TLS 1.0"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS13:
		return "TLS 1.3"
	default:
		return fmt.Sprintf("Unknown (0x%x)", version)
	}
}

// getTLSSuiteName returns human-readable cipher suite name
func getTLSSuiteName(suite uint16) string {
	switch suite {
	case tls.TLS_AES_128_GCM_SHA256:
		return "TLS_AES_128_GCM_SHA256"
	case tls.TLS_AES_256_GCM_SHA384:
		return "TLS_AES_256_GCM_SHA384"
	case tls.TLS_CHACHA20_POLY1305_SHA256:
		return "TLS_CHACHA20_POLY1305_SHA256"
	case tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256:
		return "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256"
	case tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:
		return "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256"
	case tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384:
		return "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384"
	case tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384:
		return "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"
	default:
		return fmt.Sprintf("Unknown (0x%x)", suite)
	}
}
