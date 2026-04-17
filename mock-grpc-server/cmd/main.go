package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"

	s "artemis/mock-grpc-server"

	"google.golang.org/grpc"
)

const (
	defaultPort = 50051
	tlsPort     = 50052
	outputDir   = "testcerts"
)

func main() {
	portFlag := flag.Int("port", defaultPort, "Port to listen on")
	tlsMode := flag.Bool("tls", false, "Enable TLS mode")
	flag.Parse()

	if *tlsMode {
		startTLSServer(*portFlag)
	} else {
		startPlaintextServer(*portFlag)
	}
}

// startPlaintextServer starts the gRPC server without TLS
func startPlaintextServer(port int) {
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}
	grpcServer := grpc.NewServer()

	// Register services
	s.RegisterGreeterServer(grpcServer, &s.GreeterImpl{})
	s.RegisterStreamerServer(grpcServer, &s.StreamerImpl{})
	s.RegisterUploaderServer(grpcServer, &s.UploaderImpl{})
	s.RegisterEchoServer(grpcServer, &s.EchoImpl{})

	log.Printf("gRPC mock server listening on %s (plaintext)", lis.Addr())
	log.Printf("To enable TLS: go run ./mock-grpc-server/cmd/main.go -tls -port %d\n", tlsPort)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}

// startTLSServer starts the gRPC server with TLS support
func startTLSServer(port int) {
	// Create output directory
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		log.Fatalf("Failed to create output directory: %v", err)
	}

	fmt.Println("=== Artemis gRPC mTLS Test Server ===")
	fmt.Println()

	// Step 1: Generate CA
	fmt.Println("[1/3] Generating CA certificate...")
	caCert, caKey, caCertPEM, err := generateCA()
	if err != nil {
		log.Fatalf("Failed to generate CA: %v", err)
	}
	caCertPath := filepath.Join(outputDir, "grpc-ca-cert.pem")
	if err := os.WriteFile(caCertPath, caCertPEM, 0600); err != nil {
		log.Fatalf("Failed to write CA cert: %v", err)
	}

	// Step 2: Generate server cert signed by CA
	fmt.Println("[2/3] Generating server certificate...")
	serverCert, err := generateSignedCert("localhost", caCert, caKey, true)
	if err != nil {
		log.Fatalf("Failed to generate server cert: %v", err)
	}

	// Step 3: Generate client cert signed by CA
	fmt.Println("[3/3] Generating client certificate...")
	clientCert, clientCertDER, clientKeyDER, err := generateSignedCertWithRaw("artemis-grpc-client", caCert, caKey, false)
	if err != nil {
		log.Fatalf("Failed to generate client cert: %v", err)
	}
	_ = clientCert

	// Write client cert + key as PEM for reference
	clientCertPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: clientCertDER})
	clientKeyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: clientKeyDER})
	os.WriteFile(filepath.Join(outputDir, "grpc-client-cert.pem"), clientCertPEM, 0600)
	os.WriteFile(filepath.Join(outputDir, "grpc-client-key.pem"), clientKeyPEM, 0600)

	fmt.Println()
	fmt.Println("=== Generated Files ===")
	fmt.Printf("  CA Certificate:     %s\n", caCertPath)
	fmt.Printf("  Client Certificate: %s\n", filepath.Join(outputDir, "grpc-client-cert.pem"))
	fmt.Printf("  Client Key:         %s\n", filepath.Join(outputDir, "grpc-client-key.pem"))
	fmt.Println()

	// Build TLS config with ALPN for gRPC (HTTP/2)
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{*serverCert},
		NextProtos:   []string{"h2"},
		MinVersion:   tls.VersionTLS12,
	}

	// Create TLS listener
	lis, err := tls.Listen("tcp", fmt.Sprintf(":%d", port), tlsConfig)
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	// Create gRPC server
	grpcServer := grpc.NewServer()

	// Register services
	s.RegisterGreeterServer(grpcServer, &s.GreeterImpl{})
	s.RegisterStreamerServer(grpcServer, &s.StreamerImpl{})
	s.RegisterUploaderServer(grpcServer, &s.UploaderImpl{})
	s.RegisterEchoServer(grpcServer, &s.EchoImpl{})

	fmt.Printf("=== gRPC mTLS Server listening on %s ===\n", lis.Addr())
	fmt.Println()
	fmt.Println("To test with Artemis:")
	fmt.Println("  1. In gRPC Settings:")
	fmt.Printf("     - Certificate File: %s\n", filepath.Join(outputDir, "grpc-client-cert.pem"))
	fmt.Printf("     - Key File: %s\n", filepath.Join(outputDir, "grpc-client-key.pem"))
	fmt.Printf("     - CA Cert File: %s\n", caCertPath)
	fmt.Printf("     - Enable UseTLS: true\n")
	fmt.Println("  2. Connect to: localhost:50052")
	fmt.Println()
	fmt.Println("Press Ctrl+C to stop.")
	fmt.Println()

	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}

// generateCA creates a self-signed CA certificate
func generateCA() (*x509.Certificate, *rsa.PrivateKey, []byte, error) {
	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, nil, err
	}

	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))

	caTemplate := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   "Artemis gRPC Test CA",
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

// generateSignedCert creates a certificate signed by the CA
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

// generateSignedCertWithRaw creates a certificate and returns both PEM and DER formats
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

// generateSignedCertRaw generates a certificate signed by a CA and returns DER encoded formats
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
