package main

import (
	"artemis/internal/db"
	"artemis/internal/models"
	"artemis/internal/services"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	keystore "github.com/pavlo-v-chernykh/keystore-go/v4"
)

// Config struct for application settings
type Config struct {
	Port           int    `json:"port"`
	Host           string `json:"host"`
	Timeout        int    `json:"timeout"`
	MaxHistorySize int    `json:"maxHistorySize"`
	DBPath         string `json:"dbPath"`
}

// App struct
type App struct {
	ctx                   context.Context
	config                *Config
	database              *db.DB
	collectionRepository  *db.CollectionRepository
	environmentRepository *db.EnvironmentRepository
	historyRepository     *db.HistoryRepository
	flowRepository        *db.FlowRepository
	httpClient            *services.HTTPClient
	grpcClient            *services.GRPCClient
	protoFileManager      *services.ProtoFileManager
	descriptorLoader      *services.DescriptorLoader
	mtlsTestServer        *http.Server
}

// NewApp creates a new App application struct
func NewApp(config *Config) *App {
	return &App{
		config: config,
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize database
	database, err := db.New()
	if err != nil {
		fmt.Printf("Error initializing database: %v\n", err)
		return
	}
	a.database = database

	// Initialize repositories
	a.collectionRepository = db.NewCollectionRepository(database)
	a.environmentRepository = db.NewEnvironmentRepository(database)
	a.historyRepository = db.NewHistoryRepository(database)
	a.flowRepository = db.NewFlowRepository(database)

	// Initialize HTTP client
	a.httpClient = services.NewHTTPClient()

	// Initialize gRPC client and proto file manager
	a.grpcClient = services.NewGRPCClient()
	dataDir := filepath.Join(os.Getenv("APPDATA"), "artemis")
	a.protoFileManager = services.NewProtoFileManager(dataDir)
	a.descriptorLoader = services.NewDescriptorLoader()
}

// ExecuteRequest executes an HTTP or gRPC request
func (a *App) ExecuteRequest(req *models.Request) (*models.Response, error) {
	// Default to HTTP if type not specified (for backward compatibility)
	if req.Type == "" {
		req.Type = models.RequestTypeHTTP
	}

	var response *models.Response
	var err error

	// Route to appropriate client based on request type
	if req.Type == models.RequestTypeGRPC {
		response, err = a.grpcClient.ExecuteRequest(req)
	} else {
		response, err = a.httpClient.ExecuteRequest(req)
	}

	if err != nil {
		if response == nil {
			response = &models.Response{
				StatusCode:     0,
				Status:         "Error",
				Headers:        map[string]string{},
				Body:           err.Error(),
				Size:           int64(len(err.Error())),
				Time:           0,
				ConnectionTime: 0,
				NetworkTime:    0,
				ResponseTime:   0,
				Protocol:       "",
				LogLevel:       req.LogLevel,
				Logs:           []string{"[ERROR] request failed"},
				Timestamp:      time.Now().Unix(),
			}
		}
		if a.historyRepository != nil {
			_ = a.historyRepository.Add(req, response)
		}
		return response, err
	}
	// Add to history
	if a.historyRepository != nil {
		_ = a.historyRepository.Add(req, response)
	}
	return response, nil
}

// Collections methods
func (a *App) CreateCollection(name string) (*models.Collection, error) {
	return a.collectionRepository.Create(name)
}

func (a *App) GetCollections() ([]*models.Collection, error) {
	return a.collectionRepository.GetAll()
}

func (a *App) GetCollection(id string) (*models.Collection, error) {
	return a.collectionRepository.GetByID(id)
}

func (a *App) UpdateCollection(collection *models.Collection) error {
	return a.collectionRepository.Update(collection.ID, collection.Name)
}

func (a *App) DeleteCollection(id string) error {
	return a.collectionRepository.Delete(id)
}

func (a *App) AddRequestToCollection(collectionID string, request *models.Request) error {
	return a.collectionRepository.AddRequest(collectionID, request)
}

// Environment methods
func (a *App) CreateEnvironment(name string) (*models.Environment, error) {
	return a.environmentRepository.Create(name)
}

func (a *App) GetEnvironments() ([]*models.Environment, error) {
	return a.environmentRepository.GetAll()
}

func (a *App) UpdateEnvironment(environment *models.Environment) error {
	return a.environmentRepository.Update(environment.ID, environment.Variables)
}

func (a *App) DeleteEnvironment(id string) error {
	return a.environmentRepository.Delete(id)
}

func (a *App) SetActiveEnvironment(id string) error {
	return a.environmentRepository.SetActive(id)
}

// History methods
func (a *App) GetHistory(limit, offset int) ([]*models.HistoryEntry, error) {
	return a.historyRepository.GetRecent(limit, offset)
}

func (a *App) ClearHistory() error {
	return a.historyRepository.Clear()
}

// Flow methods
func (a *App) CreateFlow(flow *models.Flow) (*models.Flow, error) {
	return a.flowRepository.Create(flow)
}

func (a *App) GetFlows() ([]*models.Flow, error) {
	return a.flowRepository.GetAll()
}

func (a *App) GetFlowsWithOptions(options db.FlowQueryOptions) ([]*models.Flow, error) {
	return a.flowRepository.GetAllWithOptions(options)
}

func (a *App) GetFlow(id string) (*models.Flow, error) {
	return a.flowRepository.GetByID(id)
}

func (a *App) UpdateFlow(flow *models.Flow) (*models.Flow, error) {
	return a.flowRepository.Update(flow)
}

func (a *App) DeleteFlow(id string) error {
	return a.flowRepository.Delete(id)
}

// SaveFlowToFile saves the flow as a JSON file in the flows directory next to the executable
func (a *App) SaveFlowToFile(flow *models.Flow) (string, error) {
	// Get the executable path
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("failed to get executable path: %w", err)
	}

	// Get the directory containing the executable
	exeDir := filepath.Dir(exePath)

	// Create flows directory if it doesn't exist
	flowsDir := filepath.Join(exeDir, "flows")
	if err := os.MkdirAll(flowsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create flows directory: %w", err)
	}

	// Create a safe filename from the flow name
	filename := flow.Name
	// Remove or replace invalid filename characters
	for _, r := range `<>:"/\|?*` {
		filename = filepath.FromSlash(string(r))
		if string(r) != "/" {
			filename = strings.ReplaceAll(flow.Name, string(r), "_")
		}
	}
	if filename == "" {
		filename = flow.ID
	}

	// Create the full file path
	filePath := filepath.Join(flowsDir, filename+".json")

	// Marshal the flow to JSON with pretty printing
	jsonData, err := json.MarshalIndent(flow, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal flow to JSON: %w", err)
	}

	// Write the file
	if err := os.WriteFile(filePath, jsonData, 0644); err != nil {
		return "", fmt.Errorf("failed to write flow file: %w", err)
	}

	return filePath, nil
}

// TestJKS validates a JKS keystore by attempting to load it with the given password
func (a *App) TestJKS(jksBase64 string, password string) (map[string]interface{}, error) {
	cert, err := a.httpClient.LoadJKSFromBase64(jksBase64, password)
	if err != nil {
		return nil, err
	}

	result := map[string]interface{}{
		"valid":    true,
		"numCerts": len(cert.Certificate),
	}

	// Parse the leaf certificate for details
	if len(cert.Certificate) > 0 {
		parsed, parseErr := services.ParseX509Certificate(cert.Certificate[0])
		if parseErr == nil {
			result["subject"] = parsed.Subject.String()
			result["issuer"] = parsed.Issuer.String()
			result["notBefore"] = parsed.NotBefore.Format(time.RFC3339)
			result["notAfter"] = parsed.NotAfter.Format(time.RFC3339)
			result["serialNumber"] = parsed.SerialNumber.String()
			if time.Now().After(parsed.NotAfter) {
				result["expired"] = true
			} else {
				result["expired"] = false
			}
		}
	}

	return result, nil
}

// StartMTLSTestServer generates a CA, server cert, client cert + JKS, and starts an mTLS HTTPS server.
// Returns connection info including the JKS file (base64), password, and server URL.
func (a *App) StartMTLSTestServer(port int) (map[string]interface{}, error) {
	if a.mtlsTestServer != nil {
		return nil, fmt.Errorf("mTLS test server is already running")
	}
	if port == 0 {
		port = 8443
	}

	jksPassword := "artemis123"

	// Generate CA
	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("generate CA key: %w", err)
	}
	caSerial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	caTemplate := &x509.Certificate{
		SerialNumber:          caSerial,
		Subject:               pkix.Name{CommonName: "Artemis Test CA", Organization: []string{"Artemis"}},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	caCertDER, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		return nil, fmt.Errorf("create CA cert: %w", err)
	}
	caCert, _ := x509.ParseCertificate(caCertDER)

	// Generate server cert signed by CA
	serverKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("generate server key: %w", err)
	}
	serverSerial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	serverTemplate := &x509.Certificate{
		SerialNumber:          serverSerial,
		Subject:               pkix.Name{CommonName: "localhost", Organization: []string{"Artemis"}},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1")},
		DNSNames:              []string{"localhost", "127.0.0.1"},
		BasicConstraintsValid: true,
	}
	serverCertDER, err := x509.CreateCertificate(rand.Reader, serverTemplate, caCert, &serverKey.PublicKey, caKey)
	if err != nil {
		return nil, fmt.Errorf("create server cert: %w", err)
	}
	serverTLSCert := tls.Certificate{
		Certificate: [][]byte{serverCertDER},
		PrivateKey:  serverKey,
	}

	// Generate client cert signed by CA
	clientKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("generate client key: %w", err)
	}
	clientSerial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	clientTemplate := &x509.Certificate{
		SerialNumber:          clientSerial,
		Subject:               pkix.Name{CommonName: "artemis-client", Organization: []string{"Artemis"}},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
	}
	clientCertDER, err := x509.CreateCertificate(rand.Reader, clientTemplate, caCert, &clientKey.PublicKey, caKey)
	if err != nil {
		return nil, fmt.Errorf("create client cert: %w", err)
	}

	// Build JKS from client cert
	pkcs8Key, err := x509.MarshalPKCS8PrivateKey(clientKey)
	if err != nil {
		return nil, fmt.Errorf("marshal client key to PKCS8: %w", err)
	}
	ks := keystore.New()
	entry := keystore.PrivateKeyEntry{
		CreationTime: time.Now(),
		PrivateKey:   pkcs8Key,
		CertificateChain: []keystore.Certificate{
			{Type: "X.509", Content: clientCertDER},
		},
	}
	if err := ks.SetPrivateKeyEntry("client", entry, []byte(jksPassword)); err != nil {
		return nil, fmt.Errorf("set JKS entry: %w", err)
	}

	var jksBuf strings.Builder
	jksEncoder := base64.NewEncoder(base64.StdEncoding, &jksBuf)
	if err := ks.Store(jksEncoder, []byte(jksPassword)); err != nil {
		return nil, fmt.Errorf("store JKS: %w", err)
	}
	jksEncoder.Close()

	// Build server TLS config requiring client certs
	caPool := x509.NewCertPool()
	caPool.AddCert(caCert)
	serverTLSConfig := &tls.Config{
		Certificates: []tls.Certificate{serverTLSCert},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    caPool,
		MinVersion:   tls.VersionTLS12,
	}

	// Create HTTP handler
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]interface{}{
			"status":  "ok",
			"message": "mTLS 2-way SSL successful!",
			"time":    time.Now().Format(time.RFC3339),
			"method":  r.Method,
			"path":    r.URL.Path,
		}
		if r.TLS != nil && len(r.TLS.PeerCertificates) > 0 {
			peer := r.TLS.PeerCertificates[0]
			resp["client_subject"] = peer.Subject.String()
			resp["client_issuer"] = peer.Issuer.String()
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	a.mtlsTestServer = &http.Server{
		Addr:      fmt.Sprintf(":%d", port),
		Handler:   mux,
		TLSConfig: serverTLSConfig,
	}

	// Start in background
	ln, err := net.Listen("tcp", a.mtlsTestServer.Addr)
	if err != nil {
		a.mtlsTestServer = nil
		return nil, fmt.Errorf("failed to listen on port %d: %w", port, err)
	}
	tlsLn := tls.NewListener(ln, serverTLSConfig)
	go func() {
		if err := a.mtlsTestServer.Serve(tlsLn); err != http.ErrServerClosed {
			fmt.Printf("mTLS test server error: %v\n", err)
		}
	}()

	// Parse client cert for info
	clientParsed, _ := x509.ParseCertificate(clientCertDER)

	// Save certificates to disk
	certDir := "certs"
	if err := os.MkdirAll(certDir, 0755); err != nil {
		fmt.Printf("Warning: failed to create cert directory: %v\n", err)
	} else {
		// Save CA certificate
		caCertPEM := &strings.Builder{}
		pem.Encode(caCertPEM, &pem.Block{Type: "CERTIFICATE", Bytes: caCertDER})
		os.WriteFile(filepath.Join(certDir, "ca.crt"), []byte(caCertPEM.String()), 0644)

		// Save server certificate
		serverCertPEM := &strings.Builder{}
		pem.Encode(serverCertPEM, &pem.Block{Type: "CERTIFICATE", Bytes: serverCertDER})
		os.WriteFile(filepath.Join(certDir, "server.crt"), []byte(serverCertPEM.String()), 0644)

		// Save server key
		serverKeyBytes, _ := x509.MarshalPKCS8PrivateKey(serverKey)
		serverKeyPEM := &strings.Builder{}
		pem.Encode(serverKeyPEM, &pem.Block{Type: "PRIVATE KEY", Bytes: serverKeyBytes})
		os.WriteFile(filepath.Join(certDir, "server.key"), []byte(serverKeyPEM.String()), 0600)

		// Save client certificate
		clientCertPEM := &strings.Builder{}
		pem.Encode(clientCertPEM, &pem.Block{Type: "CERTIFICATE", Bytes: clientCertDER})
		os.WriteFile(filepath.Join(certDir, "client.crt"), []byte(clientCertPEM.String()), 0644)

		// Save client key
		clientKeyBytes, _ := x509.MarshalPKCS8PrivateKey(clientKey)
		clientKeyPEM := &strings.Builder{}
		pem.Encode(clientKeyPEM, &pem.Block{Type: "PRIVATE KEY", Bytes: clientKeyBytes})
		os.WriteFile(filepath.Join(certDir, "client.key"), []byte(clientKeyPEM.String()), 0600)

		// Save JKS file
		jksFile, _ := os.Create(filepath.Join(certDir, "client.jks"))
		defer jksFile.Close()
		jksDecoded, _ := base64.StdEncoding.DecodeString(jksBuf.String())
		jksFile.Write(jksDecoded)

		// Save password info
		readmeContent := fmt.Sprintf("# mTLS Test Certificates\n\nGenerated: %s\n\nJKS Password: %s\n\nFiles:\n- ca.crt: CA certificate\n- server.crt: Server certificate\n- server.key: Server private key\n- client.crt: Client certificate\n- client.key: Client private key\n- client.jks: Java KeyStore with client cert\n", time.Now().Format(time.RFC3339), jksPassword)
		os.WriteFile(filepath.Join(certDir, "README.txt"), []byte(readmeContent), 0644)

		fmt.Printf("✓ Certificates saved to %s/\n", certDir)
	}

	return map[string]interface{}{
		"url":            fmt.Sprintf("https://localhost:%d", port),
		"port":           port,
		"jksBase64":      jksBuf.String(),
		"jksPassword":    jksPassword,
		"clientSubject":  clientParsed.Subject.String(),
		"clientNotAfter": clientParsed.NotAfter.Format(time.RFC3339),
		"certDir":        certDir,
	}, nil
}

// StopMTLSTestServer stops the running mTLS test server
func (a *App) StopMTLSTestServer() error {
	if a.mtlsTestServer == nil {
		return fmt.Errorf("no mTLS test server is running")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err := a.mtlsTestServer.Shutdown(ctx)
	a.mtlsTestServer = nil
	return err
}

// Config method
func (a *App) GetConfig() *Config {
	return a.config
}

// gRPC Proto Management methods

// GetAvailableGRPCServices returns all available gRPC services from uploaded and directory proto files
func (a *App) GetAvailableGRPCServices() (map[string][]*models.ProtoMethod, error) {
	services := make(map[string][]*models.ProtoMethod)

	// Get proto files from upload directory
	uploadedFiles, err := a.protoFileManager.ListProtoFiles()
	if err == nil {
		for _, filename := range uploadedFiles {
			filePath := a.protoFileManager.GetProtoFilePath(filename)
			if protoFile, err := a.descriptorLoader.LoadProtoFile(filePath); err == nil {
				for _, svc := range protoFile.Services {
					fullName := svc.Name
					if protoFile.PackageName != "" {
						fullName = protoFile.PackageName + "." + svc.Name
					}
					// Convert []ProtoMethod to []*ProtoMethod
					methods := make([]*models.ProtoMethod, len(svc.Methods))
					for i := range svc.Methods {
						methods[i] = &svc.Methods[i]
					}
					services[fullName] = methods
				}
			}
		}
	}

	return services, nil
}

// UploadProtoFile saves an uploaded proto file
func (a *App) UploadProtoFile(filename string, content string) error {
	return a.protoFileManager.UploadProtoFile(filename, []byte(content))
}

// DeleteProtoFile removes a proto file
func (a *App) DeleteProtoFile(filename string) error {
	return a.protoFileManager.DeleteProtoFile(filename)
}

// ListProtoFiles returns all uploaded proto files
func (a *App) ListProtoFiles() ([]string, error) {
	return a.protoFileManager.ListProtoFiles()
}

// LoadProtoFilesFromDirectory scans a directory for proto files
func (a *App) LoadProtoFilesFromDirectory(dirPath string) ([]string, error) {
	return a.protoFileManager.LoadProtoFilesFromDirectory(dirPath)
}

// GetProtoDirectory returns the directory where proto files are stored
func (a *App) GetProtoDirectory() string {
	return a.protoFileManager.GetProtoDirectory()
}

// shutdown is called when the app closes
func (a *App) shutdown(ctx context.Context) {
	if a.database != nil {
		a.database.Close()
	}
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
