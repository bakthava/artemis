package services

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

// TestCertificateGenerator generates test SSL certificates
type TestCertificateGenerator struct {
	tmpDir string
}

// NewTestCertificateGenerator creates a new certificate generator
func NewTestCertificateGenerator(tmpDir string) *TestCertificateGenerator {
	return &TestCertificateGenerator{tmpDir: tmpDir}
}

// GenerateSelfSignedCert generates a self-signed certificate and key
func (tcg *TestCertificateGenerator) GenerateSelfSignedCert(commonName string, certFile, keyFile string) (*tls.Certificate, error) {
	// Generate private key
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("failed to generate private key: %w", err)
	}

	// Generate serial number
	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, fmt.Errorf("failed to generate serial number: %w", err)
	}

	// Create certificate template
	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			CommonName:   commonName,
			Organization: []string{"Artemis Test"},
			Country:      []string{"US"},
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("localhost")},
		DNSNames:              []string{commonName, "localhost", "127.0.0.1"},
	}

	// Sign certificate with private key
	certBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &privateKey.PublicKey, privateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create certificate: %w", err)
	}

	// Encode certificate and key to PEM
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certBytes})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(privateKey)})

	// Write to files if specified
	if certFile != "" {
		if err := os.WriteFile(certFile, certPEM, 0600); err != nil {
			return nil, fmt.Errorf("failed to write cert file: %w", err)
		}
	}

	if keyFile != "" {
		if err := os.WriteFile(keyFile, keyPEM, 0600); err != nil {
			return nil, fmt.Errorf("failed to write key file: %w", err)
		}
	}

	// Parse into tls.Certificate
	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("failed to parse certificate pair: %w", err)
	}

	return &cert, nil
}

// GenerateServerCertificates generates server certificate and key files
func (tcg *TestCertificateGenerator) GenerateServerCertificates(commonName string) (certPath, keyPath string, cert *tls.Certificate, err error) {
	certPath = filepath.Join(tcg.tmpDir, commonName+"-cert.pem")
	keyPath = filepath.Join(tcg.tmpDir, commonName+"-key.pem")

	cert, err = tcg.GenerateSelfSignedCert(commonName, certPath, keyPath)
	if err != nil {
		return "", "", nil, err
	}

	return certPath, keyPath, cert, nil
}

// GenerateClientCertificates generates client certificate and key files
func (tcg *TestCertificateGenerator) GenerateClientCertificates(commonName string) (certPath, keyPath string, cert *tls.Certificate, err error) {
	certPath = filepath.Join(tcg.tmpDir, commonName+"-client-cert.pem")
	keyPath = filepath.Join(tcg.tmpDir, commonName+"-client-key.pem")

	cert, err = tcg.GenerateSelfSignedCert(commonName, certPath, keyPath)
	if err != nil {
		return "", "", nil, err
	}

	return certPath, keyPath, cert, nil
}

// GenerateCACertificate generates a CA certificate
func (tcg *TestCertificateGenerator) GenerateCACertificate(commonName string) (certPath string, cert *tls.Certificate, err error) {
	certPath = filepath.Join(tcg.tmpDir, commonName+"-ca-cert.pem")

	// Generate private key
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return "", nil, fmt.Errorf("failed to generate private key: %w", err)
	}

	// Generate serial number
	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return "", nil, fmt.Errorf("failed to generate serial number: %w", err)
	}

	// Create CA certificate template
	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			CommonName:   commonName,
			Organization: []string{"Artemis Test CA"},
			Country:      []string{"US"},
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            2,
	}

	// Self-sign CA
	certBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &privateKey.PublicKey, privateKey)
	if err != nil {
		return "", nil, fmt.Errorf("failed to create CA certificate: %w", err)
	}

	// Encode to PEM
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certBytes})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(privateKey)})

	// Write cert file
	if err := os.WriteFile(certPath, certPEM, 0600); err != nil {
		return "", nil, fmt.Errorf("failed to write CA cert file: %w", err)
	}

	// Parse into tls.Certificate
	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return "", nil, fmt.Errorf("failed to parse CA certificate pair: %w", err)
	}

	return certPath, &tlsCert, nil
}

// BuildServerTLSConfig builds a TLS config for server
func (tcg *TestCertificateGenerator) BuildServerTLSConfig(certPath, keyPath string) (*tls.Config, error) {
	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load certificate pair: %w", err)
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
	}, nil
}

// BuildClientTLSConfig builds a TLS config for client
func (tcg *TestCertificateGenerator) BuildClientTLSConfig(certPath, keyPath, caCertPath string) (*tls.Config, error) {
	// Load client certificate if provided
	var clientCert tls.Certificate
	if certPath != "" && keyPath != "" {
		var err error
		clientCert, err = tls.LoadX509KeyPair(certPath, keyPath)
		if err != nil {
			return nil, fmt.Errorf("failed to load client certificate pair: %w", err)
		}
	}

	// Load CA certificate
	caCertPool := x509.NewCertPool()
	if caCertPath != "" {
		caCert, err := os.ReadFile(caCertPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read CA certificate: %w", err)
		}
		if !caCertPool.AppendCertsFromPEM(caCert) {
			return nil, fmt.Errorf("failed to parse CA certificate")
		}
	}

	tlsConfig := &tls.Config{
		InsecureSkipVerify: true, // For testing only
		RootCAs:            caCertPool,
	}

	if certPath != "" && keyPath != "" {
		tlsConfig.Certificates = []tls.Certificate{clientCert}
	}

	return tlsConfig, nil
}

// CleanUp removes generated certificate files
func (tcg *TestCertificateGenerator) CleanUp(files ...string) error {
	for _, file := range files {
		if err := os.Remove(file); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("failed to remove file %s: %w", file, err)
		}
	}
	return nil
}
