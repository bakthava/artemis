package main

import (
	"artemis/internal/db"
	"artemis/internal/models"
	"artemis/internal/services"
	"archive/zip"
	"bytes"
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
	"io"
	"math/big"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
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
	certificateRepository *db.CertificateRepository
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
	a.certificateRepository = db.NewCertificateRepository(database)

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
	collection, err := a.collectionRepository.Create(name)
	if err != nil {
		return nil, err
	}
	_ = a.persistCollectionsForActiveEnvironment()
	return collection, nil
}

func (a *App) GetCollections() ([]*models.Collection, error) {
	return a.collectionRepository.GetAll()
}

func (a *App) GetCollection(id string) (*models.Collection, error) {
	return a.collectionRepository.GetByID(id)
}

func (a *App) UpdateCollection(collection *models.Collection) error {
	err := a.collectionRepository.Update(collection.ID, collection.Name)
	if err != nil {
		return err
	}
	_ = a.persistCollectionsForActiveEnvironment()
	return nil
}

func (a *App) DeleteCollection(id string) error {
	err := a.collectionRepository.Delete(id)
	if err != nil {
		return err
	}
	_ = a.persistCollectionsForActiveEnvironment()
	return nil
}

func (a *App) AddRequestToCollection(collectionID string, request *models.Request) error {
	if request.ID == "" {
		request.ID = uuid.New().String()
	}
	err := a.collectionRepository.AddRequest(collectionID, request)
	if err != nil {
		return err
	}
	_ = a.persistCollectionsForActiveEnvironment()
	return nil
}

// Environment methods
func (a *App) CreateEnvironment(name string) (*models.Environment, error) {
	env, err := a.environmentRepository.Create(name)
	if err != nil {
		return nil, err
	}
	_ = a.persistCollectionsForActiveEnvironment()
	return env, nil
}

func (a *App) GetEnvironments() ([]*models.Environment, error) {
	return a.environmentRepository.GetAll()
}

func (a *App) UpdateEnvironment(environment *models.Environment) error {
	err := a.environmentRepository.Update(environment.ID, environment.Variables)
	if err != nil {
		return err
	}
	_ = a.persistCollectionsForActiveEnvironment()
	return nil
}

func (a *App) DeleteEnvironment(id string) error {
	err := a.environmentRepository.Delete(id)
	if err != nil {
		return err
	}
	_ = a.persistCollectionsForActiveEnvironment()
	return nil
}

func (a *App) SetActiveEnvironment(id string) error {
	err := a.environmentRepository.SetActive(id)
	if err != nil {
		return err
	}
	_ = a.persistCollectionsForActiveEnvironment()
	return nil
}

// ExportCollections returns all collections packaged for export.
func (a *App) ExportCollections() (map[string]interface{}, error) {
	collections, err := a.collectionRepository.GetAll()
	if err != nil {
		return nil, err
	}
	envName := a.getActiveEnvironmentName()
	return map[string]interface{}{
		"version":         1,
		"type":            "collections",
		"environmentName": envName,
		"exportedAt":      time.Now().Format(time.RFC3339),
		"collections":     collections,
	}, nil
}

// ImportCollections imports collections and their requests into storage.
func (a *App) ImportCollections(collections []*models.Collection) (int, error) {
	imported := 0
	for _, collection := range collections {
		if collection == nil {
			continue
		}

		name := strings.TrimSpace(collection.Name)
		if name == "" {
			name = "Imported Collection"
		}

		created, err := a.collectionRepository.Create(name)
		if err != nil {
			return imported, err
		}

		for _, req := range collection.Requests {
			if req == nil {
				continue
			}
			if req.ID == "" {
				req.ID = uuid.New().String()
			}
			if err := a.collectionRepository.AddRequest(created.ID, req); err != nil {
				return imported, err
			}
		}

		imported++
	}

	_ = a.persistCollectionsForActiveEnvironment()
	return imported, nil
}

// ExportEnvironments returns all environments packaged for export.
func (a *App) ExportEnvironments() (map[string]interface{}, error) {
	environments, err := a.environmentRepository.GetAll()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"version":      1,
		"type":         "environments",
		"exportedAt":   time.Now().Format(time.RFC3339),
		"environments": environments,
	}, nil
}

// ImportEnvironments imports environments and restores active environment if specified.
func (a *App) ImportEnvironments(environments []*models.Environment) (int, error) {
	imported := 0
	var activeEnvID string

	for _, environment := range environments {
		if environment == nil {
			continue
		}

		name := strings.TrimSpace(environment.Name)
		if name == "" {
			name = "Imported Environment"
		}

		created, err := a.environmentRepository.Create(name)
		if err != nil {
			return imported, err
		}

		vars := environment.Variables
		if vars == nil {
			vars = map[string]string{}
		}

		if err := a.environmentRepository.Update(created.ID, vars); err != nil {
			return imported, err
		}

		if environment.Active {
			activeEnvID = created.ID
		}

		imported++
	}

	if activeEnvID != "" {
		if err := a.environmentRepository.SetActive(activeEnvID); err != nil {
			return imported, err
		}
	}

	_ = a.persistCollectionsForActiveEnvironment()
	return imported, nil
}

// ExportProject exports collections and environments together.
func (a *App) ExportProject() (map[string]interface{}, error) {
	collections, err := a.collectionRepository.GetAll()
	if err != nil {
		return nil, err
	}
	environments, err := a.environmentRepository.GetAll()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"version":       1,
		"type":          "project",
		"exportedAt":    time.Now().Format(time.RFC3339),
		"projectName":   "artemis",
		"activeEnvName": a.getActiveEnvironmentName(),
		"collections":   collections,
		"environments":  environments,
	}, nil
}

// ImportProject imports a project payload containing environments and collections.
func (a *App) ImportProject(environments []*models.Environment, collections []*models.Collection) (map[string]int, error) {
	envCount, err := a.ImportEnvironments(environments)
	if err != nil {
		return nil, err
	}

	colCount, err := a.ImportCollections(collections)
	if err != nil {
		return nil, err
	}

	return map[string]int{
		"environments": envCount,
		"collections":  colCount,
	}, nil
}

func sanitizePathSegment(value string) string {
	if strings.TrimSpace(value) == "" {
		return "default"
	}
	replacer := strings.NewReplacer(
		"<", "_",
		">", "_",
		":", "_",
		"\"", "_",
		"/", "_",
		"\\", "_",
		"|", "_",
		"?", "_",
		"*", "_",
	)
	return replacer.Replace(strings.TrimSpace(value))
}

func (a *App) getActiveEnvironmentName() string {
	if a.environmentRepository == nil {
		return "default"
	}
	environments, err := a.environmentRepository.GetAll()
	if err != nil {
		return "default"
	}
	for _, env := range environments {
		if env != nil && env.Active {
			if strings.TrimSpace(env.Name) != "" {
				return env.Name
			}
			break
		}
	}
	return "default"
}

func (a *App) persistCollectionsForActiveEnvironment() error {
	collections, err := a.collectionRepository.GetAll()
	if err != nil {
		return err
	}

	envName := sanitizePathSegment(a.getActiveEnvironmentName())
	baseDir := filepath.Join(os.Getenv("APPDATA"), "artemis", "environments", envName)
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return err
	}

	payload := map[string]interface{}{
		"version":         1,
		"environmentName": envName,
		"savedAt":         time.Now().Format(time.RFC3339),
		"collections":     collections,
	}

	bytes, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(baseDir, "collections.json"), bytes, 0644)
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

// CreateFlowZip creates a ZIP file containing flow data and certificates
func (a *App) CreateFlowZip(flowData map[string]interface{}, form *multipart.Form) ([]byte, error) {
	buf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(buf)
	defer zipWriter.Close()

	// Add flow.json
	flowFile, err := zipWriter.Create("flow.json")
	if err != nil {
		return nil, fmt.Errorf("failed to create flow.json in zip: %w", err)
	}
	flowJSON, err := json.MarshalIndent(flowData, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal flow data: %w", err)
	}
	if _, err := flowFile.Write(flowJSON); err != nil {
		return nil, fmt.Errorf("failed to write flow.json: %w", err)
	}

	// Add certificates.json if provided
	if certsFile := form.File["certificates"]; len(certsFile) > 0 {
		file, err := certsFile[0].Open()
		if err == nil {
			defer file.Close()
			certZipFile, err := zipWriter.Create("certificates.json")
			if err == nil {
				io.Copy(certZipFile, file)
			}
		}
	}

	// Add data files if provided
	if dataFiles := form.File["dataFiles"]; len(dataFiles) > 0 {
		for _, fileHeader := range dataFiles {
			file, err := fileHeader.Open()
			if err != nil {
				continue
			}
			defer file.Close()

			// Create data/ directory structure in ZIP
			dataZipFile, err := zipWriter.Create("data/" + fileHeader.Filename)
			if err != nil {
				continue
			}
			io.Copy(dataZipFile, file)
		}
	}

	if err := zipWriter.Close(); err != nil {
		return nil, fmt.Errorf("failed to close zip writer: %w", err)
	}

	return buf.Bytes(), nil
}

// ParseFlowZip extracts and parses a ZIP file containing flow data
func (a *App) ParseFlowZip(zipFile io.Reader) (map[string]interface{}, map[string]interface{}, map[string]string, error) {
	// Read ZIP into memory
	zipData, err := io.ReadAll(zipFile)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to read zip file: %w", err)
	}

	zipReader, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		return nil, nil, nil, fmt.Errorf("failed to open zip: %w", err)
	}

	var flowData map[string]interface{}
	certificatesData := make(map[string]interface{})
	dataFiles := make(map[string]string)

	for _, file := range zipReader.File {
		content, err := file.Open()
		if err != nil {
			continue
		}
		defer content.Close()

		fileContent, err := io.ReadAll(content)
		if err != nil {
			continue
		}

		// Parse flow.json
		if file.Name == "flow.json" {
			if err := json.Unmarshal(fileContent, &flowData); err != nil {
				return nil, nil, nil, fmt.Errorf("invalid flow.json: %w", err)
			}
		}

		// Parse certificates.json
		if file.Name == "certificates.json" {
			if err := json.Unmarshal(fileContent, &certificatesData); err != nil {
				// Log but don't fail - certificates are optional
				fmt.Printf("Warning: invalid certificates.json: %v\n", err)
			}
		}

		// Extract data files
		if strings.HasPrefix(file.Name, "data/") && file.Name != "data/" {
			dataFileName := strings.TrimPrefix(file.Name, "data/")
			dataFiles[dataFileName] = string(fileContent)
		}
	}

	if flowData == nil {
		return nil, nil, nil, fmt.Errorf("flow.json not found in ZIP")
	}

	return flowData, certificatesData, dataFiles, nil
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
