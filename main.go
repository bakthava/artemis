package main

import (
	"context"
	"encoding/json"
	"fmt"
	"artemis/internal/models"
	"log"
	"net/http"
	"os"
	"os/signal"
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
	// Middleware chain
	h := http.HandlerFunc(s.handleCORS)

	// Collections endpoints
	s.router.HandleFunc("POST /api/collections", s.handleCreateCollection)
	s.router.HandleFunc("GET /api/collections", s.handleGetCollections)
	s.router.HandleFunc("GET /api/collections/{id}", s.handleGetCollection)
	s.router.HandleFunc("PUT /api/collections/{id}", s.handleUpdateCollection)
	s.router.HandleFunc("DELETE /api/collections/{id}", s.handleDeleteCollection)
	s.router.HandleFunc("POST /api/collections/{id}/requests", s.handleAddRequest)

	// Environments endpoints
	s.router.HandleFunc("POST /api/environments", s.handleCreateEnvironment)
	s.router.HandleFunc("GET /api/environments", s.handleGetEnvironments)
	s.router.HandleFunc("PUT /api/environments/{id}", s.handleUpdateEnvironment)
	s.router.HandleFunc("DELETE /api/environments/{id}", s.handleDeleteEnvironment)
	s.router.HandleFunc("POST /api/environments/{id}/active", s.handleSetActiveEnvironment)

	// History endpoints
	s.router.HandleFunc("GET /api/history", s.handleGetHistory)
	s.router.HandleFunc("DELETE /api/history", s.handleClearHistory)

	// Request execution endpoint
	s.router.HandleFunc("POST /api/request/execute", s.handleExecuteRequest)

	// Serve frontend (SPA fallback to index.html)
	s.router.HandleFunc("/", s.handleStatic)
	_ = h
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

func (s *HTTPServer) handleStatic(w http.ResponseWriter, r *http.Request) {
	s.handleCORS(w, r)
	// Serve frontend files
	file := "./frontend/dist" + r.URL.Path
	if file == "./frontend/dist/" || file == "./frontend/dist" {
		file = "./frontend/dist/index.html"
	}
	http.ServeFile(w, r, file)
}

func (s *HTTPServer) ListenAndServe(addr string) error {
	log.Printf("Artemis starting on http://%s", addr)
	return http.ListenAndServe(addr, s.router)
}

func main() {
	// Initialize app
	app := NewApp()
	ctx := context.Background()
	app.startup(ctx)
	defer app.shutdown(ctx)

	// Create HTTP server
	server := NewHTTPServer(app)

	// Start server in goroutine
	go func() {
		if err := server.ListenAndServe(":8080"); err != nil && err != http.ErrServerClosed {
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
