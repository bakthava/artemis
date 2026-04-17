package main

import (
	"artemis/internal/db"
	"artemis/internal/models"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// HTTPServer wraps the app and provides HTTP handlers
type HTTPServer struct {
	app    *App
	router *http.ServeMux
}

// NewHTTPServer creates a new HTTP server with routes
func NewHTTPServer(app *App) *HTTPServer {
	srv := &HTTPServer{
		app:    app,
		router: http.NewServeMux(),
	}

	// Setup routes
	srv.setupRoutes()
	return srv
}

// setupRoutes configures all HTTP endpoints
func (s *HTTPServer) setupRoutes() {
	// Collections endpoints
	s.router.HandleFunc("POST /api/collections", s.handleCreateCollection)
	s.router.HandleFunc("GET /api/collections", s.handleGetCollections)
	s.router.HandleFunc("GET /api/collections/export", s.handleExportCollections)
	s.router.HandleFunc("POST /api/collections/import", s.handleImportCollections)
	s.router.HandleFunc("GET /api/collections/{id}", s.handleGetCollection)
	s.router.HandleFunc("PUT /api/collections/{id}", s.handleUpdateCollection)
	s.router.HandleFunc("DELETE /api/collections/{id}", s.handleDeleteCollection)
	s.router.HandleFunc("POST /api/collections/{id}/requests", s.handleAddRequest)

	// Environments endpoints
	s.router.HandleFunc("POST /api/environments", s.handleCreateEnvironment)
	s.router.HandleFunc("GET /api/environments", s.handleGetEnvironments)
	s.router.HandleFunc("GET /api/environments/export", s.handleExportEnvironments)
	s.router.HandleFunc("POST /api/environments/import", s.handleImportEnvironments)
	s.router.HandleFunc("PUT /api/environments/{id}", s.handleUpdateEnvironment)
	s.router.HandleFunc("DELETE /api/environments/{id}", s.handleDeleteEnvironment)
	s.router.HandleFunc("POST /api/environments/{id}/active", s.handleSetActiveEnvironment)

	// Project import/export endpoints
	s.router.HandleFunc("GET /api/project/export", s.handleExportProject)
	s.router.HandleFunc("POST /api/project/import", s.handleImportProject)

	// History endpoints
	s.router.HandleFunc("GET /api/history", s.handleGetHistory)
	s.router.HandleFunc("DELETE /api/history", s.handleClearHistory)

	// Flow endpoints
	s.router.HandleFunc("POST /api/flows", s.handleCreateFlow)
	s.router.HandleFunc("GET /api/flows", s.handleGetFlows)
	s.router.HandleFunc("GET /api/flows/{id}", s.handleGetFlow)
	s.router.HandleFunc("PUT /api/flows/{id}", s.handleUpdateFlow)
	s.router.HandleFunc("DELETE /api/flows/{id}", s.handleDeleteFlow)
	s.router.HandleFunc("POST /api/flows/{id}/export", s.handleExportFlowToFile)

	// Request execution endpoint
	s.router.HandleFunc("POST /api/request/execute", s.handleExecuteRequest)
	s.router.HandleFunc("OPTIONS /api/request/execute", s.handleCORSOptions)

	// Certificate / mTLS test endpoints
	s.router.HandleFunc("POST /api/certificates/test-jks", s.handleTestJKS)
	s.router.HandleFunc("POST /api/certificates/test-jks-password", s.handleTestJKSPassword)
	s.router.HandleFunc("POST /api/certificates/mtls-server/start", s.handleStartMTLSServer)
	s.router.HandleFunc("POST /api/certificates/mtls-server/stop", s.handleStopMTLSServer)

	// Proto file parsing endpoint
	s.router.HandleFunc("POST /api/proto/parse", s.handleParseProto)

	// Certificate management endpoints
	s.router.HandleFunc("POST /api/certificates", s.handleUploadCertificate)
	s.router.HandleFunc("GET /api/certificates", s.handleListCertificates)
	s.router.HandleFunc("GET /api/certificates/{id}", s.handleGetCertificate)
	s.router.HandleFunc("DELETE /api/certificates/{id}", s.handleDeleteCertificate)
	s.router.HandleFunc("GET /api/certificate-sets", s.handleListCertificateSets)
	s.router.HandleFunc("POST /api/certificate-sets", s.handleCreateCertificateSet)
	s.router.HandleFunc("GET /api/certificate-sets/{id}", s.handleGetCertificateSet)
	s.router.HandleFunc("PUT /api/certificate-sets/{id}", s.handleUpdateCertificateSet)
	s.router.HandleFunc("DELETE /api/certificate-sets/{id}", s.handleDeleteCertificateSet)

	// Serve frontend (SPA fallback to index.html)
	s.router.HandleFunc("/", s.handleStatic)
}

func (s *HTTPServer) handleCORS(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
}

func (s *HTTPServer) handleCORSOptions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.WriteHeader(http.StatusOK)
}

func (s *HTTPServer) handleCreateCollection(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	collection, err := s.app.CreateCollection(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(collection)
}

func (s *HTTPServer) handleGetCollections(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	collections, err := s.app.GetCollections()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(collections)
}

func (s *HTTPServer) handleExportCollections(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	payload, err := s.app.ExportCollections()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payload)
}

func (s *HTTPServer) handleImportCollections(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var req struct {
		Collections []*models.Collection `json:"collections"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	count, err := s.app.ImportCollections(req.Collections)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"imported": count,
	})
}

func (s *HTTPServer) handleGetCollection(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	collection, err := s.app.GetCollection(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(collection)
}

func (s *HTTPServer) handleUpdateCollection(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	var collection struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&collection); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	err := s.app.UpdateCollection(&models.Collection{ID: id, Name: collection.Name})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *HTTPServer) handleDeleteCollection(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	if err := s.app.DeleteCollection(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *HTTPServer) handleAddRequest(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	collectionID := r.PathValue("id")
	var req models.Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := s.app.AddRequestToCollection(collectionID, &req); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *HTTPServer) handleCreateEnvironment(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	env, err := s.app.CreateEnvironment(req.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(env)
}

func (s *HTTPServer) handleGetEnvironments(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	environments, err := s.app.GetEnvironments()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(environments)
}

func (s *HTTPServer) handleExportEnvironments(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	payload, err := s.app.ExportEnvironments()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payload)
}

func (s *HTTPServer) handleImportEnvironments(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var req struct {
		Environments []*models.Environment `json:"environments"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	count, err := s.app.ImportEnvironments(req.Environments)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"imported": count,
	})
}

func (s *HTTPServer) handleExportProject(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	payload, err := s.app.ExportProject()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payload)
}

func (s *HTTPServer) handleImportProject(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var req struct {
		Collections  []*models.Collection  `json:"collections"`
		Environments []*models.Environment `json:"environments"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	counts, err := s.app.ImportProject(req.Environments, req.Collections)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(counts)
}

func (s *HTTPServer) handleUpdateEnvironment(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	var env struct {
		Variables map[string]string `json:"variables"`
	}
	if err := json.NewDecoder(r.Body).Decode(&env); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	err := s.app.UpdateEnvironment(&models.Environment{ID: id, Variables: env.Variables})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *HTTPServer) handleDeleteEnvironment(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	if err := s.app.DeleteEnvironment(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *HTTPServer) handleSetActiveEnvironment(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	if err := s.app.SetActiveEnvironment(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *HTTPServer) handleGetHistory(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	limit := 100
	offset := 0
	history, err := s.app.GetHistory(limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(history)
}

func (s *HTTPServer) handleClearHistory(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	if err := s.app.ClearHistory(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *HTTPServer) handleExecuteRequest(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var req models.Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]interface{}{
				"message": err.Error(),
			},
		})
		return
	}
	if req.JksFile != "" {
		fmt.Printf("[DEBUG] Request received with JKS file (size: %d bytes)\n", len(req.JksFile))
	} else {
		fmt.Printf("[DEBUG] Request received without JKS file\n")
	}
	response, err := s.app.ExecuteRequest(&req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]interface{}{
				"message":  err.Error(),
				"response": response,
			},
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *HTTPServer) handleCreateFlow(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var flow models.Flow
	if err := json.NewDecoder(r.Body).Decode(&flow); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	saved, err := s.app.CreateFlow(&flow)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(saved)
}

func (s *HTTPServer) handleGetFlows(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	q := r.URL.Query()
	options := db.FlowQueryOptions{
		Name: strings.TrimSpace(q.Get("name")),
		Sort: strings.TrimSpace(q.Get("sort")),
	}
	if rawLimit := strings.TrimSpace(q.Get("limit")); rawLimit != "" {
		limit, err := strconv.Atoi(rawLimit)
		if err != nil {
			http.Error(w, "invalid limit", http.StatusBadRequest)
			return
		}
		options.Limit = limit
	}
	if rawOffset := strings.TrimSpace(q.Get("offset")); rawOffset != "" {
		offset, err := strconv.Atoi(rawOffset)
		if err != nil {
			http.Error(w, "invalid offset", http.StatusBadRequest)
			return
		}
		options.Offset = offset
	}

	flows, err := s.app.GetFlowsWithOptions(options)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(flows)
}

func (s *HTTPServer) handleGetFlow(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	flow, err := s.app.GetFlow(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(flow)
}

func (s *HTTPServer) handleUpdateFlow(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	var flow models.Flow
	if err := json.NewDecoder(r.Body).Decode(&flow); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	flow.ID = id
	saved, err := s.app.UpdateFlow(&flow)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(saved)
}

func (s *HTTPServer) handleDeleteFlow(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	if err := s.app.DeleteFlow(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *HTTPServer) handleExportFlowToFile(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	flow, err := s.app.GetFlow(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	filePath, err := s.app.SaveFlowToFile(flow)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"filePath": filePath})
}

func (s *HTTPServer) handleTestJKS(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var req struct {
		JKSBase64 string `json:"jksBase64"`
		Password  string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	result, err := s.app.TestJKS(req.JKSBase64, req.Password)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"valid": false, "error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *HTTPServer) handleTestJKSPassword(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var req struct {
		CertificateID string `json:"certificateId"`
		Password      string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.CertificateID == "" {
		http.Error(w, "certificateId is required", http.StatusBadRequest)
		return
	}

	cert, err := s.app.certificateRepository.GetCertificate(req.CertificateID)
	if err != nil {
		http.Error(w, "certificate not found", http.StatusNotFound)
		return
	}

	if cert.Type != models.CertificateTypeJKS {
		http.Error(w, "certificate is not a JKS type", http.StatusBadRequest)
		return
	}

	result, err := s.app.TestJKS(cert.Content, req.Password)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"valid": false, "error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *HTTPServer) handleStartMTLSServer(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var req struct {
		Port int `json:"port"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Port == 0 {
		req.Port = 8443
	}
	result, err := s.app.StartMTLSTestServer(req.Port)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *HTTPServer) handleStopMTLSServer(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	if err := s.app.StopMTLSTestServer(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "stopped"})
}

func (s *HTTPServer) handleParseProto(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var req struct {
		Content  string `json:"content"`
		Filename string `json:"filename"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Content == "" {
		http.Error(w, `{"error":"content is required"}`, http.StatusBadRequest)
		return
	}
	protoFile, err := s.app.descriptorLoader.ParseProtoContent(req.Filename, req.Content)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(protoFile)
}

// Certificate handlers
func (s *HTTPServer) handleUploadCertificate(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var req struct {
		Name     string   `json:"name"`
		Type     string   `json:"type"`
		Content  string   `json:"content"`
		Filename string   `json:"filename"`
		Tags     []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	cert := &models.Certificate{
		Name:     req.Name,
		Type:     models.CertificateType(req.Type),
		Content:  req.Content,
		Filename: req.Filename,
		Tags:     req.Tags,
	}

	if err := s.app.certificateRepository.SaveCertificate(cert); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cert)
}

func (s *HTTPServer) handleListCertificates(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	certs, err := s.app.certificateRepository.ListCertificates()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(certs)
}

func (s *HTTPServer) handleGetCertificate(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	cert, err := s.app.certificateRepository.GetCertificate(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cert)
}

func (s *HTTPServer) handleDeleteCertificate(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	if err := s.app.certificateRepository.DeleteCertificate(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *HTTPServer) handleListCertificateSets(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	sets, err := s.app.certificateRepository.ListCertificateSets()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sets)
}

func (s *HTTPServer) handleCreateCertificateSet(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	var set models.CertificateSet
	if err := json.NewDecoder(r.Body).Decode(&set); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.app.certificateRepository.SaveCertificateSet(&set); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(set)
}

func (s *HTTPServer) handleGetCertificateSet(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	set, err := s.app.certificateRepository.GetCertificateSet(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(set)
}

func (s *HTTPServer) handleUpdateCertificateSet(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	var set models.CertificateSet
	if err := json.NewDecoder(r.Body).Decode(&set); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	set.ID = id

	if err := s.app.certificateRepository.SaveCertificateSet(&set); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(set)
}

func (s *HTTPServer) handleDeleteCertificateSet(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	id := r.PathValue("id")
	if err := s.app.certificateRepository.DeleteCertificateSet(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *HTTPServer) handleStatic(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	base, ok := findFrontendDistDir()
	if !ok {
		http.Error(w, "frontend assets not found (expected frontend/dist)", http.StatusInternalServerError)
		return
	}

	reqPath := strings.TrimPrefix(filepath.Clean(r.URL.Path), string(filepath.Separator))
	if reqPath == "." || reqPath == "" {
		reqPath = "index.html"
	}

	assetPath := filepath.Join(base, reqPath)
	if st, err := os.Stat(assetPath); err == nil && !st.IsDir() {
		http.ServeFile(w, r, assetPath)
		return
	}

	// SPA fallback
	http.ServeFile(w, r, filepath.Join(base, "index.html"))
}

func findFrontendDistDir() (string, bool) {
	exePath, err := os.Executable()
	if err != nil {
		return "", false
	}
	exeDir := filepath.Dir(exePath)

	candidates := []string{
		filepath.Join(exeDir, "frontend", "dist"),
		filepath.Join(exeDir, "dist"),
		filepath.Join(".", "frontend", "dist"),
	}

	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			return c, true
		}
	}
	return "", false
}

func (s *HTTPServer) ListenAndServe(addr string) error {
	log.Printf("Artemis starting on http://%s", addr)
	return http.ListenAndServe(addr, s.router)
}

func defaultConfig() *Config {
	return &Config{
		Port:           8080,
		Host:           "localhost",
		Timeout:        30,
		MaxHistorySize: 100,
		DBPath:         "artemis.db",
	}
}

func findConfigFilePath() (string, bool) {
	exePath, err := os.Executable()
	if err != nil {
		return "", false
	}

	exeDir := filepath.Dir(exePath)
	candidates := []string{
		filepath.Join(exeDir, "config.json"),
		filepath.Join(".", "config.json"),
	}

	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c, true
		}
	}

	return "", false
}

// LoadConfig reads configuration from config.json.
func LoadConfig() (*Config, error) {
	config := defaultConfig()
	configPath, found := findConfigFilePath()
	if !found {
		log.Printf("Warning: config.json not found, using defaults")
		return config, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		log.Printf("Warning: Could not read %s, using defaults: %v", configPath, err)
		return config, nil
	}

	if err := json.Unmarshal(data, config); err != nil {
		log.Printf("Warning: Could not parse %s, using defaults: %v", configPath, err)
		return defaultConfig(), nil
	}

	log.Printf("Loaded config from %s", configPath)
	return config, nil
}

func main() {
	// Load configuration
	config, err := LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize app with config
	app := NewApp(config)
	ctx := context.Background()
	app.startup(ctx)
	defer app.shutdown(ctx)

	// Create HTTP server
	server := NewHTTPServer(app)

	// Start server in goroutine
	addr := fmt.Sprintf(":%d", config.Port)
	go func() {
		log.Printf("Server starting on %s:%d", config.Host, config.Port)
		if err := server.ListenAndServe(addr); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\nShutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = ctx
}
