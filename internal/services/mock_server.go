package services

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

// MockGRPCServer implements a mock gRPC server for testing
type MockGRPCServer struct {
	server          *grpc.Server
	listener        net.Listener
	addr            string
	mu              sync.Mutex
	isRunning       bool
	useInsecure     bool
	tlsConfig       *tls.Config
}

// NewMockGRPCServer creates a new mock gRPC server
func NewMockGRPCServer(addr string, useInsecure bool, tlsConfig *tls.Config) *MockGRPCServer {
	return &MockGRPCServer{
		addr:        addr,
		useInsecure: useInsecure,
		tlsConfig:   tlsConfig,
	}
}

// Start starts the mock gRPC server
func (m *MockGRPCServer) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.isRunning {
		return fmt.Errorf("server is already running")
	}

	listener, err := net.Listen("tcp", m.addr)
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	var serverOpts []grpc.ServerOption

	if !m.useInsecure && m.tlsConfig != nil {
		creds := credentials.NewTLS(m.tlsConfig)
		serverOpts = append(serverOpts, grpc.Creds(creds))
	}

	m.server = grpc.NewServer(serverOpts...)
	m.listener = listener
	m.isRunning = true

	// Start server in goroutine
	go func() {
		if err := m.server.Serve(listener); err != nil {
			log.Printf("gRPC server error: %v", err)
		}
	}()

	// Give server time to start
	time.Sleep(100 * time.Millisecond)
	return nil
}

// Stop stops the mock gRPC server
func (m *MockGRPCServer) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.isRunning && m.server != nil {
		m.server.GracefulStop()
		m.isRunning = false
	}
}

// GetAddr returns the server address
func (m *MockGRPCServer) GetAddr() string {
	return m.addr
}

// IsRunning checks if server is running
func (m *MockGRPCServer) IsRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.isRunning
}

// SimpleUnaryHandler handles simple unary calls (for testing with generic calls)
type SimpleUnaryHandler struct{}

// HandleHello handles hello requests
func (h *SimpleUnaryHandler) HandleHello(ctx context.Context, req interface{}) (interface{}, error) {
	// Convert request to map or return mock response
	return map[string]interface{}{
		"message":   "Hello from mock server",
		"timestamp": time.Now().Format(time.RFC3339),
	}, nil
}

// MockHTTPServer implements a mock HTTP/HTTPS server for testing
type MockHTTPServer struct {
	server      *HTTPServerInstance
	listener    net.Listener
	addr        string
	mu          sync.Mutex
	isRunning   bool
	useInsecure bool
	tlsConfig   *tls.Config
	port        int
}

// HTTPServerInstance wraps http.Server
type HTTPServerInstance struct {
	listeners   map[string]http.ResponseWriter
	requestLog  []*RequestLog
	mu          sync.Mutex
}

// RequestLog stores logged HTTP requests
type RequestLog struct {
	Method      string
	Path        string
	Headers     map[string][]string
	Body        []byte
	Timestamp   time.Time
	StatusCode  int
}

// NewMockHTTPServer creates a new mock HTTP server
func NewMockHTTPServer(port int) *MockHTTPServer {
	addr := fmt.Sprintf("localhost:%d", port)
	return &MockHTTPServer{
		addr:        addr,
		port:        port,
		useInsecure: true,
	}
}

// NewMockHTTPSServer creates a new mock HTTPS server with TLS
func NewMockHTTPSServer(port int, tlsConfig *tls.Config) *MockHTTPServer {
	addr := fmt.Sprintf("localhost:%d", port)
	return &MockHTTPServer{
		addr:        addr,
		port:        port,
		useInsecure: false,
		tlsConfig:   tlsConfig,
	}
}

// Start starts the mock HTTP/HTTPS server
func (m *MockHTTPServer) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.isRunning {
		return fmt.Errorf("server is already running")
	}

	listener, err := net.Listen("tcp", m.addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", m.addr, err)
	}

	m.listener = listener
	m.isRunning = true

	// Start server in goroutine
	go func() {
		if m.useInsecure {
			// HTTP server
			if err := m.serveHTTP(listener); err != nil {
				log.Printf("HTTP server error: %v", err)
			}
		} else {
			// HTTPS server
			if err := m.serveHTTPS(listener); err != nil {
				log.Printf("HTTPS server error: %v", err)
			}
		}
	}()

	time.Sleep(100 * time.Millisecond)
	return nil
}

// serveHTTP serves HTTP requests
func (m *MockHTTPServer) serveHTTP(listener net.Listener) error {
	for {
		conn, err := listener.Accept()
		if err != nil {
			return err
		}
		go m.handleHTTPConnection(conn)
	}
}

// serveHTTPS serves HTTPS requests with TLS
func (m *MockHTTPServer) serveHTTPS(listener net.Listener) error {
	tlsListener := tls.NewListener(listener, m.tlsConfig)
	defer tlsListener.Close()

	for {
		conn, err := tlsListener.Accept()
		if err != nil {
			return err
		}
		go m.handleHTTPConnection(conn)
	}
}

// handleHTTPConnection handles individual HTTP connections
func (m *MockHTTPServer) handleHTTPConnection(conn net.Conn) {
	defer conn.Close()

	// Read the incoming request before responding
	buf := make([]byte, 4096)
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	conn.Read(buf)

	// Simple HTTP response
	body := `{"status":"ok","message":"Mock HTTP Server Response","timestamp":"` + time.Now().Format(time.RFC3339) + `"}`
	response := "HTTP/1.1 200 OK\r\n"
	response += "Content-Type: application/json\r\n"
	response += fmt.Sprintf("Content-Length: %d\r\n", len(body))
	response += "Connection: close\r\n"
	response += "\r\n"
	response += body

	fmt.Fprint(conn, response)
}

// Stop stops the mock HTTP/HTTPS server
func (m *MockHTTPServer) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.isRunning && m.listener != nil {
		m.listener.Close()
		m.isRunning = false
	}
}

// GetAddr returns the server address
func (m *MockHTTPServer) GetAddr() string {
	return m.addr
}

// IsRunning checks if server is running
func (m *MockHTTPServer) IsRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.isRunning
}

// GetPort returns the server port
func (m *MockHTTPServer) GetPort() int {
	return m.port
}

// SimpleTestServer wraps both HTTP and gRPC servers for integrated testing
type SimpleTestServer struct {
	httpServer  *MockHTTPServer
	grpcServer  *MockGRPCServer
	httpPort    int
	httpsPort   int
	grpcPort    int
}

// NewSimpleTestServer creates a new test server suite
func NewSimpleTestServer(httpPort, httpsPort, grpcPort int) *SimpleTestServer {
	return &SimpleTestServer{
		httpPort:  httpPort,
		httpsPort: httpsPort,
		grpcPort:  grpcPort,
	}
}

// StartHTTP starts the HTTP server
func (s *SimpleTestServer) StartHTTP() error {
	s.httpServer = NewMockHTTPServer(s.httpPort)
	return s.httpServer.Start()
}

// StartHTTPS starts the HTTPS server with TLS
func (s *SimpleTestServer) StartHTTPS(tlsConfig *tls.Config) error {
	s.httpServer = NewMockHTTPSServer(s.httpsPort, tlsConfig)
	return s.httpServer.Start()
}

// StartGRPC starts the gRPC server
func (s *SimpleTestServer) StartGRPC(useInsecure bool, tlsConfig *tls.Config) error {
	addr := fmt.Sprintf("localhost:%d", s.grpcPort)
	s.grpcServer = NewMockGRPCServer(addr, useInsecure, tlsConfig)
	return s.grpcServer.Start()
}

// StopAll stops all servers
func (s *SimpleTestServer) StopAll() {
	if s.httpServer != nil {
		s.httpServer.Stop()
	}
	if s.grpcServer != nil {
		s.grpcServer.Stop()
	}
}

// GetHTTPAddr returns HTTP server address
func (s *SimpleTestServer) GetHTTPAddr() string {
	if s.httpServer != nil {
		return s.httpServer.GetAddr()
	}
	return fmt.Sprintf("localhost:%d", s.httpPort)
}

// GetHTTPSAddr returns HTTPS server address
func (s *SimpleTestServer) GetHTTPSAddr() string {
	if s.httpServer != nil {
		return s.httpServer.GetAddr()
	}
	return fmt.Sprintf("localhost:%d", s.httpsPort)
}

// GetGRPCAddr returns gRPC server address
func (s *SimpleTestServer) GetGRPCAddr() string {
	if s.grpcServer != nil {
		return s.grpcServer.GetAddr()
	}
	return fmt.Sprintf("localhost:%d", s.grpcPort)
}
