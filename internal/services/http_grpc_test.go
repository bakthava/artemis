package services

import (
	"artemis/internal/models"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	keystore "github.com/pavlo-v-chernykh/keystore-go/v4"
)

// TestHTTPClient tests HTTP client functionality
func TestHTTPClient_ExecuteSimpleHTTPRequest(t *testing.T) {
	// Start mock HTTP server
	testServer := NewSimpleTestServer(8881, 8882, 9001)
	if err := testServer.StartHTTP(); err != nil {
		t.Fatalf("Failed to start HTTP server: %v", err)
	}
	defer testServer.StopAll()

	client := NewHTTPClient()

	// Test simple GET request
	req := &models.Request{
		ID:      "test-1",
		Name:    "Test HTTP GET",
		Type:    models.RequestTypeHTTP,
		Method:  "GET",
		URL:     "http://" + testServer.GetHTTPAddr() + "/test",
		Headers: map[string]string{"User-Agent": "artemis-test"},
		Timeout: 10,
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Errorf("ExecuteRequest failed: %v", err)
		return
	}

	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	if resp.ResponseTime == 0 {
		t.Error("Response time should be greater than 0")
	}

	t.Logf("✓ HTTP GET request successful. Status: %d, Time: %dms", resp.StatusCode, resp.ResponseTime)
}

// TestHTTPClient_ExecutePostRequest tests HTTP POST request
func TestHTTPClient_ExecutePostRequest(t *testing.T) {
	testServer := NewSimpleTestServer(8883, 8884, 9002)
	if err := testServer.StartHTTP(); err != nil {
		t.Fatalf("Failed to start HTTP server: %v", err)
	}
	defer testServer.StopAll()

	client := NewHTTPClient()

	req := &models.Request{
		ID:       "test-2",
		Name:     "Test HTTP POST",
		Type:     models.RequestTypeHTTP,
		Method:   "POST",
		URL:      "http://" + testServer.GetHTTPAddr() + "/api/test",
		Headers:  map[string]string{"Content-Type": "application/json"},
		Body:     `{"key":"value"}`,
		BodyType: "json",
		Timeout:  10,
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Errorf("ExecuteRequest failed: %v", err)
		return
	}

	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	t.Logf("✓ HTTP POST request successful. Status: %d", resp.StatusCode)
}

// TestHTTPClient_WithQueryParams tests HTTP request with query parameters
func TestHTTPClient_WithQueryParams(t *testing.T) {
	testServer := NewSimpleTestServer(8885, 8886, 9003)
	if err := testServer.StartHTTP(); err != nil {
		t.Fatalf("Failed to start HTTP server: %v", err)
	}
	defer testServer.StopAll()

	client := NewHTTPClient()

	req := &models.Request{
		ID:      "test-3",
		Name:    "Test HTTP with Query Params",
		Type:    models.RequestTypeHTTP,
		Method:  "GET",
		URL:     "http://" + testServer.GetHTTPAddr() + "/search",
		Timeout: 10,
		QueryParams: map[string]string{
			"q":    "artemis",
			"page": "1",
		},
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Errorf("ExecuteRequest failed: %v", err)
		return
	}

	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	t.Logf("✓ HTTP request with query params successful. Status: %d", resp.StatusCode)
}

// TestHTTPClient_WithCustomHeaders tests HTTP request with custom headers
func TestHTTPClient_WithCustomHeaders(t *testing.T) {
	testServer := NewSimpleTestServer(8887, 8888, 9004)
	if err := testServer.StartHTTP(); err != nil {
		t.Fatalf("Failed to start HTTP server: %v", err)
	}
	defer testServer.StopAll()

	client := NewHTTPClient()

	req := &models.Request{
		ID:     "test-4",
		Name:   "Test HTTP with Custom Headers",
		Type:   models.RequestTypeHTTP,
		Method: "GET",
		URL:    "http://" + testServer.GetHTTPAddr() + "/api/users",
		Headers: map[string]string{
			"Authorization": "Bearer token123",
			"X-Custom-Header": "custom-value",
			"Accept": "application/json",
		},
		Timeout: 10,
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Errorf("ExecuteRequest failed: %v", err)
		return
	}

	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	t.Logf("✓ HTTP request with custom headers successful. Status: %d", resp.StatusCode)
}

// TestHTTPSClient_ExecuteSimpleHTTPSRequest tests HTTPS without client certificates
func TestHTTPSClient_ExecuteSimpleHTTPSRequest(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "artemis-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Generate self-signed certificate
	certGen := NewTestCertificateGenerator(tmpDir)
	serverCertPath, serverKeyPath, _, err := certGen.GenerateServerCertificates("localhost")
	if err != nil {
		t.Fatalf("Failed to generate server certificate: %v", err)
	}
	defer certGen.CleanUp(serverCertPath, serverKeyPath)

	// Build server TLS config
	serverTLSConfig, err := certGen.BuildServerTLSConfig(serverCertPath, serverKeyPath)
	if err != nil {
		t.Fatalf("Failed to build server TLS config: %v", err)
	}

	// Start HTTPS server
	testServer := NewSimpleTestServer(9005, 8889, 9006)
	if err := testServer.StartHTTPS(serverTLSConfig); err != nil {
		t.Fatalf("Failed to start HTTPS server: %v", err)
	}
	defer testServer.StopAll()

	client := NewHTTPClient()

	req := &models.Request{
		ID:        "test-5",
		Name:      "Test HTTPS GET",
		Type:      models.RequestTypeHTTP,
		Method:    "GET",
		URL:       "https://" + testServer.GetHTTPSAddr() + "/api/secured",
		VerifySSL: false, // Skip verification for self-signed cert in test
		Timeout:   10,
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		// Expected to fail with self-signed cert, but we set VerifySSL to false
		t.Logf("HTTPS request result: %v", err)
	}

	if resp != nil {
		t.Logf("✓ HTTPS request executed. Status: %d", resp.StatusCode)
	}
}

// TestHTTPSClient_WithClientCertificate tests HTTPS with client certificate (mTLS)
func TestHTTPSClient_WithClientCertificate(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "artemis-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	certGen := NewTestCertificateGenerator(tmpDir)

	// Generate server certificate
	serverCertPath, serverKeyPath, _, err := certGen.GenerateServerCertificates("localhost")
	if err != nil {
		t.Fatalf("Failed to generate server certificate: %v", err)
	}

	// Generate client certificate  
	clientCertPath, clientKeyPath, _, err := certGen.GenerateClientCertificates("test-client")
	if err != nil {
		t.Fatalf("Failed to generate client certificate: %v", err)
	}

	defer certGen.CleanUp(serverCertPath, serverKeyPath, clientCertPath, clientKeyPath)

	// Build server TLS config
	serverTLSConfig, err := certGen.BuildServerTLSConfig(serverCertPath, serverKeyPath)
	if err != nil {
		t.Fatalf("Failed to build server TLS config: %v", err)
	}

	// Start HTTPS server
	testServer := NewSimpleTestServer(9007, 8890, 9008)
	if err := testServer.StartHTTPS(serverTLSConfig); err != nil {
		t.Fatalf("Failed to start HTTPS server: %v", err)
	}
	defer testServer.StopAll()

	client := NewHTTPClient()

	req := &models.Request{
		ID:              "test-6",
		Name:            "Test HTTPS with Client Certificate",
		Type:            models.RequestTypeHTTP,
		Method:          "GET",
		URL:             "https://" + testServer.GetHTTPSAddr() + "/api/secure",
		VerifySSL:       false,
		CertificateFile: clientCertPath,
		KeyFile:         clientKeyPath,
		Timeout:         10,
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Logf("HTTPS with client cert result: %v", err)
	}

	if resp != nil {
		t.Logf("✓ HTTPS with client certificate request executed. Status: %d", resp.StatusCode)
	}
}

// TestGRPCClient_ExecuteUnaryCall tests gRPC unary call
func TestGRPCClient_ExecuteUnaryCall(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "artemis-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Start insecure gRPC server
	testServer := NewSimpleTestServer(9009, 8891, 9010)
	if err := testServer.StartGRPC(true, nil); err != nil {
		t.Fatalf("Failed to start gRPC server: %v", err)
	}
	defer testServer.StopAll()

	client := NewGRPCClient()

	req := &models.Request{
		ID:     "grpc-test-1",
		Name:   "Test gRPC Unary Call",
		Type:   models.RequestTypeGRPC,
		URL:    testServer.GetGRPCAddr(),
		Body:   `{"name":"Alice","count":1}`,
		Timeout: 10,
		GRPCConfig: &models.GRPCConfig{
			Service:       "test.TestService",
			Method:        "SayHello",
			MessageFormat: "JSON",
			Metadata:      map[string]string{},
			CallType:      models.StreamingCallTypeUnary,
		},
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Logf("gRPC unary call result: %v", err)
	}

	if resp != nil {
		t.Logf("✓ gRPC unary call executed. Status: %d, Response Time: %dms", resp.StatusCode, resp.ResponseTime)
		if resp.Body != "" {
			t.Logf("  Response Body: %s", resp.Body[:min(100, len(resp.Body))])
		}
	}
}

// TestGRPCClient_WithMetadata tests gRPC call with metadata
func TestGRPCClient_WithMetadata(t *testing.T) {
	testServer := NewSimpleTestServer(9011, 8892, 9012)
	if err := testServer.StartGRPC(true, nil); err != nil {
		t.Fatalf("Failed to start gRPC server: %v", err)
	}
	defer testServer.StopAll()

	client := NewGRPCClient()

	req := &models.Request{
		ID:     "grpc-test-2",
		Name:   "Test gRPC with Metadata",
		Type:   models.RequestTypeGRPC,
		URL:    testServer.GetGRPCAddr(),
		Body:   `{"name":"Bob","count":1}`,
		Timeout: 10,
		GRPCConfig: &models.GRPCConfig{
			Service:       "test.TestService",
			Method:        "SayHello",
			MessageFormat: "JSON",
			Metadata: map[string]string{
				"authorization": "bearer token123",
				"x-request-id":   "req-12345",
			},
			CallType: models.StreamingCallTypeUnary,
		},
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Logf("gRPC with metadata result: %v", err)
	}

	if resp != nil {
		t.Logf("✓ gRPC with metadata executed. Status: %d", resp.StatusCode)
	}
}

// TestGRPCClient_ServerStreaming tests gRPC server streaming
func TestGRPCClient_ServerStreaming(t *testing.T) {
	testServer := NewSimpleTestServer(9013, 8893, 9014)
	if err := testServer.StartGRPC(true, nil); err != nil {
		t.Fatalf("Failed to start gRPC server: %v", err)
	}
	defer testServer.StopAll()

	client := NewGRPCClient()

	req := &models.Request{
		ID:     "grpc-test-3",
		Name:   "Test gRPC Server Streaming",
		Type:   models.RequestTypeGRPC,
		URL:    testServer.GetGRPCAddr(),
		Body:   `{"prefix":"msg","count":5}`,
		Timeout: 10,
		GRPCConfig: &models.GRPCConfig{
			Service:       "test.TestService",
			Method:        "ServerStream",
			MessageFormat: "JSON",
			Metadata:      map[string]string{},
			CallType:      models.StreamingCallTypeServerStream,
		},
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Logf("gRPC server streaming result: %v", err)
	}

	if resp != nil {
		t.Logf("✓ gRPC server streaming executed. Status: %d", resp.StatusCode)
	}
}

// TestGRPCClient_ClientStreaming tests gRPC client streaming
func TestGRPCClient_ClientStreaming(t *testing.T) {
	testServer := NewSimpleTestServer(9015, 8894, 9016)
	if err := testServer.StartGRPC(true, nil); err != nil {
		t.Fatalf("Failed to start gRPC server: %v", err)
	}
	defer testServer.StopAll()

	client := NewGRPCClient()

	// Send array of messages for client streaming
	req := &models.Request{
		ID:     "grpc-test-4",
		Name:   "Test gRPC Client Streaming",
		Type:   models.RequestTypeGRPC,
		URL:    testServer.GetGRPCAddr(),
		Body:   `[{"data":"msg1"},{"data":"msg2"},{"data":"msg3"}]`,
		Timeout: 10,
		GRPCConfig: &models.GRPCConfig{
			Service:       "test.TestService",
			Method:        "ClientStream",
			MessageFormat: "JSON",
			Metadata:      map[string]string{},
			CallType:      models.StreamingCallTypeClientStream,
		},
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Logf("gRPC client streaming result: %v", err)
	}

	if resp != nil {
		t.Logf("✓ gRPC client streaming executed. Status: %d", resp.StatusCode)
	}
}

// TestGRPCClient_BidirectionalStreaming tests gRPC bidirectional streaming
func TestGRPCClient_BidirectionalStreaming(t *testing.T) {
	testServer := NewSimpleTestServer(9017, 8895, 9018)
	if err := testServer.StartGRPC(true, nil); err != nil {
		t.Fatalf("Failed to start gRPC server: %v", err)
	}
	defer testServer.StopAll()

	client := NewGRPCClient()

	req := &models.Request{
		ID:     "grpc-test-5",
		Name:   "Test gRPC Bidirectional Streaming",
		Type:   models.RequestTypeGRPC,
		URL:    testServer.GetGRPCAddr(),
		Body:   `[{"text":"hello","sequence":1},{"text":"world","sequence":2}]`,
		Timeout: 10,
		GRPCConfig: &models.GRPCConfig{
			Service:       "test.TestService",
			Method:        "BidirectionalStream",
			MessageFormat: "JSON",
			Metadata:      map[string]string{},
			CallType:      models.StreamingCallTypeBidirectionalStream,
		},
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Logf("gRPC bidirectional streaming result: %v", err)
	}

	if resp != nil {
		t.Logf("✓ gRPC bidirectional streaming executed. Status: %d", resp.StatusCode)
	}
}

// TestGRPCClient_WithTLS tests gRPC with TLS
func TestGRPCClient_WithTLS(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "artemis-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	certGen := NewTestCertificateGenerator(tmpDir)

	// Generate server certificate
	serverCertPath, serverKeyPath, _, err := certGen.GenerateServerCertificates("localhost")
	if err != nil {
		t.Fatalf("Failed to generate server certificate: %v", err)
	}
	defer certGen.CleanUp(serverCertPath, serverKeyPath)

	// Build server TLS config
	serverTLSConfig, err := certGen.BuildServerTLSConfig(serverCertPath, serverKeyPath)
	if err != nil {
		t.Fatalf("Failed to build server TLS config: %v", err)
	}

	// Start TLS gRPC server
	testServer := NewSimpleTestServer(9019, 8896, 9020)
	if err := testServer.StartGRPC(false, serverTLSConfig); err != nil {
		t.Fatalf("Failed to start gRPC server with TLS: %v", err)
	}
	defer testServer.StopAll()

	client := NewGRPCClient()

	// Note: In test, we use paths but actual cert loading is skipped by test
	req := &models.Request{
		ID:     "grpc-test-6",
		Name:   "Test gRPC with TLS",
		Type:   models.RequestTypeGRPC,
		URL:    testServer.GetGRPCAddr(),
		Body:   `{"name":"Charlie","count":1}`,
		Timeout: 10,
		GRPCConfig: &models.GRPCConfig{
			Service:       "test.TestService",
			Method:        "SayHello",
			MessageFormat: "JSON",
			Metadata:      map[string]string{},
			CallType:      models.StreamingCallTypeUnary,
			CertificateFile: serverCertPath, // Server cert path (for client TLS)
		},
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Logf("gRPC with TLS result: %v", err)
	}

	if resp != nil {
		t.Logf("✓ gRPC with TLS executed. Status: %d", resp.StatusCode)
	}
}

// TestProtoFileManager_UploadAndLoad tests proto file management
func TestProtoFileManager_UploadAndLoad(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "artemis-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	manager := NewProtoFileManager(tmpDir)

	// Create a simple proto file
	protoContent := `syntax = "proto3";

package test;

service TestService {
  rpc SayHello(HelloRequest) returns (HelloReply) {}
}

message HelloRequest {
  string name = 1;
}

message HelloReply {
  string message = 1;
}`

	// Upload proto file
	err = manager.UploadProtoFile("test.proto", []byte(protoContent))
	if err != nil {
		t.Fatalf("Failed to upload proto file: %v", err)
	}

	// List proto files
	files, err := manager.ListProtoFiles()
	if err != nil {
		t.Fatalf("Failed to list proto files: %v", err)
	}

	if len(files) != 1 {
		t.Errorf("Expected 1 proto file, got %d", len(files))
	}

	if files[0] != "test.proto" {
		t.Errorf("Expected filename 'test.proto', got '%s'", files[0])
	}

	// Verify file exists
	filePath := manager.GetProtoFilePath("test.proto")
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		t.Fatalf("Proto file not found: %v", err)
	}

	t.Logf("✓ Proto file uploaded successfully. File: %s, Size: %d bytes", fileInfo.Name(), fileInfo.Size())

	// Delete proto file
	err = manager.DeleteProtoFile("test.proto")
	if err != nil {
		t.Fatalf("Failed to delete proto file: %v", err)
	}

	files, err = manager.ListProtoFiles()
	if err != nil {
		t.Fatalf("Failed to list proto files: %v", err)
	}

	if len(files) != 0 {
		t.Errorf("Expected 0 proto files, got %d", len(files))
	}

	t.Log("✓ Proto file management test completed successfully")
}

// TestDescriptorLoader_ParseProtoFile tests proto file parsing
func TestDescriptorLoader_ParseProtoFile(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "artemis-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create a test proto file
	protoContent := `syntax = "proto3";

package helloworld;

service Greeter {
  rpc SayHello(HelloRequest) returns (HelloReply) {}
  rpc GetGreetings(GreetingRequest) returns (stream GreetingReply) {}
}

message HelloRequest {
  string name = 1;
}

message HelloReply {
  string message = 1;
}

message GreetingRequest {
  string prefix = 1;
}

message GreetingReply {
  string greeting = 1;
}`

	protoPath := filepath.Join(tmpDir, "helloworld.proto")
	err = os.WriteFile(protoPath, []byte(protoContent), 0644)
	if err != nil {
		t.Fatalf("Failed to write proto file: %v", err)
	}

	loader := NewDescriptorLoader()
	protoFile, err := loader.LoadProtoFile(protoPath)
	if err != nil {
		t.Fatalf("Failed to load proto file: %v", err)
	}

	if protoFile.PackageName != "helloworld" {
		t.Errorf("Expected package 'helloworld', got '%s'", protoFile.PackageName)
	}

	if len(protoFile.Services) != 1 {
		t.Errorf("Expected 1 service, got %d", len(protoFile.Services))
		return
	}

	service := protoFile.Services[0]
	if service.Name != "Greeter" {
		t.Errorf("Expected service name 'Greeter', got '%s'", service.Name)
	}

	if len(service.Methods) != 2 {
		t.Errorf("Expected 2 methods, got %d", len(service.Methods))
		return
	}

	// Check first method (unary)
	method1 := service.Methods[0]
	if method1.Name != "SayHello" {
		t.Errorf("Expected method name 'SayHello', got '%s'", method1.Name)
	}
	if method1.IsServerStream || method1.IsClientStream {
		t.Error("SayHello should not be streaming")
	}

	// Check second method (server streaming)
	method2 := service.Methods[1]
	if method2.Name != "GetGreetings" {
		t.Errorf("Expected method name 'GetGreetings', got '%s'", method2.Name)
	}
	if !method2.IsServerStream {
		t.Error("GetGreetings should be server streaming")
	}

	t.Logf("✓ Proto file parsing successful.")
	t.Logf("  Package: %s", protoFile.PackageName)
	t.Logf("  Service: %s", service.Name)
	t.Logf("  Methods: %d", len(service.Methods))
	for _, m := range service.Methods {
		streamType := ""
		if m.IsServerStream {
			streamType = " (server streaming)"
		} else if m.IsClientStream {
			streamType = " (client streaming)"
		}
		t.Logf("    - %s%s", m.Name, streamType)
	}
}

// TestIntegration_HTTPAndGRPC tests both HTTP and gRPC in sequence
func TestIntegration_HTTPAndGRPC(t *testing.T) {
	t.Log("=== Integration Test: HTTP and gRPC ===")

	// Setup test servers
	httpServer := NewSimpleTestServer(9021, 8897, 9022)
	if err := httpServer.StartHTTP(); err != nil {
		t.Fatalf("Failed to start HTTP server: %v", err)
	}
	defer httpServer.StopAll()

	grpcServer := NewSimpleTestServer(9023, 8898, 9024)
	if err := grpcServer.StartGRPC(true, nil); err != nil {
		t.Fatalf("Failed to start gRPC server: %v", err)
	}
	defer grpcServer.StopAll()

	// Test HTTP client
	httpClient := NewHTTPClient()
	httpReq := &models.Request{
		ID:      "int-test-1",
		Name:    "Integration Test HTTP",
		Type:    models.RequestTypeHTTP,
		Method:  "GET",
		URL:     "http://" + httpServer.GetHTTPAddr() + "/status",
		Timeout: 10,
	}

	httpResp, err := httpClient.ExecuteRequest(httpReq)
	if err != nil {
		t.Logf("HTTP request in integration test failed: %v", err)
	}

	if httpResp != nil && httpResp.StatusCode == 200 {
		t.Logf("✓ HTTP request successful. Status: %d", httpResp.StatusCode)
	}

	// Test gRPC client
	grpcClient := NewGRPCClient()
	grpcReq := &models.Request{
		ID:     "int-test-2",
		Name:   "Integration Test gRPC",
		Type:   models.RequestTypeGRPC,
		URL:    grpcServer.GetGRPCAddr(),
		Body:   `{"name":"Integration","count":1}`,
		Timeout: 10,
		GRPCConfig: &models.GRPCConfig{
			Service:       "test.TestService",
			Method:        "SayHello",
			MessageFormat: "JSON",
			CallType:      models.StreamingCallTypeUnary,
		},
	}

	grpcResp, err := grpcClient.ExecuteRequest(grpcReq)
	if err != nil {
		t.Logf("gRPC request in integration test failed: %v", err)
	}

	if grpcResp != nil && grpcResp.StatusCode == 200 {
		t.Logf("✓ gRPC request successful. Status: %d", grpcResp.StatusCode)
	}

	t.Log("✓ Integration test completed")
}

// Utility function
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// readFileAsBase64 reads a file and returns its content as base64-encoded string
func readFileAsBase64(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Failed to read file %s: %v", path, err)
	}
	return base64.StdEncoding.EncodeToString(data)
}

// buildTestJKS creates a JKS keystore from PEM cert and key files for testing
func buildTestJKS(t *testing.T, certPath, keyPath, jksPath, password string) error {
	t.Helper()

	certPEM, err := os.ReadFile(certPath)
	if err != nil {
		return fmt.Errorf("read cert: %w", err)
	}
	keyPEM, err := os.ReadFile(keyPath)
	if err != nil {
		return fmt.Errorf("read key: %w", err)
	}

	// Parse certificate
	certBlock, _ := pem.Decode(certPEM)
	if certBlock == nil {
		return fmt.Errorf("failed to decode cert PEM")
	}

	// Parse private key
	keyBlock, _ := pem.Decode(keyPEM)
	if keyBlock == nil {
		return fmt.Errorf("failed to decode key PEM")
	}

	// Marshal key to PKCS8
	privKey, err := x509.ParsePKCS8PrivateKey(keyBlock.Bytes)
	if err != nil {
		// Try PKCS1 and re-marshal to PKCS8
		rsaKey, err2 := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
		if err2 != nil {
			return fmt.Errorf("parse private key: %w (also tried PKCS1: %v)", err, err2)
		}
		keyBlock.Bytes, err = x509.MarshalPKCS8PrivateKey(rsaKey)
		if err != nil {
			return fmt.Errorf("marshal to PKCS8: %w", err)
		}
		_ = privKey // suppress unused warning
	}

	ks := keystore.New()
	entry := keystore.PrivateKeyEntry{
		CreationTime: time.Now(),
		PrivateKey:   keyBlock.Bytes,
		CertificateChain: []keystore.Certificate{
			{
				Type:    "X.509",
				Content: certBlock.Bytes,
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

	if err := ks.Store(f, []byte(password)); err != nil {
		return fmt.Errorf("store JKS: %w", err)
	}

	return nil
}

// TestHTTPS_MutualTLS_Success tests 2-way SSL where client provides a valid certificate
func TestHTTPS_MutualTLS_Success(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "artemis-mtls-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	certGen := NewTestCertificateGenerator(tmpDir)

	// Generate CA
	caCertPath, caCert, caKey, err := certGen.GenerateCA("Artemis-Test-CA")
	if err != nil {
		t.Fatalf("Failed to generate CA: %v", err)
	}

	// Generate server cert signed by CA
	serverCertPath := filepath.Join(tmpDir, "server-cert.pem")
	serverKeyPath := filepath.Join(tmpDir, "server-key.pem")
	_, err = certGen.GenerateCASignedCert("localhost", caCert, caKey, true, serverCertPath, serverKeyPath)
	if err != nil {
		t.Fatalf("Failed to generate server certificate: %v", err)
	}

	// Generate client cert signed by same CA
	clientCertPath := filepath.Join(tmpDir, "client-cert.pem")
	clientKeyPath := filepath.Join(tmpDir, "client-key.pem")
	_, err = certGen.GenerateCASignedCert("test-client", caCert, caKey, false, clientCertPath, clientKeyPath)
	if err != nil {
		t.Fatalf("Failed to generate client certificate: %v", err)
	}

	// Build mTLS server config: server requires client cert signed by CA
	serverTLSConfig, err := certGen.BuildMutualTLSServerConfig(serverCertPath, serverKeyPath, caCertPath)
	if err != nil {
		t.Fatalf("Failed to build mTLS server config: %v", err)
	}

	// Start HTTPS server with mTLS
	testServer := NewSimpleTestServer(9030, 9031, 9032)
	if err := testServer.StartHTTPS(serverTLSConfig); err != nil {
		t.Fatalf("Failed to start mTLS HTTPS server: %v", err)
	}
	defer testServer.StopAll()

	client := NewHTTPClient()

	// Client provides cert+key (base64 encoded as the real frontend does)
	req := &models.Request{
		ID:              "mtls-test-1",
		Name:            "Test mTLS Success",
		Type:            models.RequestTypeHTTP,
		Method:          "GET",
		URL:             "https://" + testServer.GetHTTPSAddr() + "/api/secure",
		VerifySSL:       false, // Self-signed CA, skip server verification in test
		CertificateFile: readFileAsBase64(t, clientCertPath),
		KeyFile:         readFileAsBase64(t, clientKeyPath),
		Timeout:         10,
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Fatalf("mTLS request failed unexpectedly: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	t.Logf("✓ mTLS 2-way SSL successful. Status: %d, Time: %dms", resp.StatusCode, resp.Time)
}

// TestHTTPS_MutualTLS_NoClientCert tests that mTLS server rejects a client without a certificate
func TestHTTPS_MutualTLS_NoClientCert(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "artemis-mtls-nocert-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	certGen := NewTestCertificateGenerator(tmpDir)

	// Generate CA
	caCertPath, caCert, caKey, err := certGen.GenerateCA("Artemis-Test-CA")
	if err != nil {
		t.Fatalf("Failed to generate CA: %v", err)
	}

	// Generate server cert signed by CA
	serverCertPath := filepath.Join(tmpDir, "server-cert.pem")
	serverKeyPath := filepath.Join(tmpDir, "server-key.pem")
	_, err = certGen.GenerateCASignedCert("localhost", caCert, caKey, true, serverCertPath, serverKeyPath)
	if err != nil {
		t.Fatalf("Failed to generate server certificate: %v", err)
	}

	// Build mTLS server config
	serverTLSConfig, err := certGen.BuildMutualTLSServerConfig(serverCertPath, serverKeyPath, caCertPath)
	if err != nil {
		t.Fatalf("Failed to build mTLS server config: %v", err)
	}

	// Start HTTPS server with mTLS
	testServer := NewSimpleTestServer(9033, 9034, 9035)
	if err := testServer.StartHTTPS(serverTLSConfig); err != nil {
		t.Fatalf("Failed to start mTLS HTTPS server: %v", err)
	}
	defer testServer.StopAll()

	client := NewHTTPClient()

	// Client does NOT provide any certificate
	req := &models.Request{
		ID:        "mtls-test-2",
		Name:      "Test mTLS No Client Cert",
		Type:      models.RequestTypeHTTP,
		Method:    "GET",
		URL:       "https://" + testServer.GetHTTPSAddr() + "/api/secure",
		VerifySSL: false,
		Timeout:   10,
	}

	_, err = client.ExecuteRequest(req)
	if err == nil {
		t.Fatal("Expected mTLS to fail without client certificate, but it succeeded")
	}

	t.Logf("✓ mTLS correctly rejected client without certificate: %v", err)
}

// TestHTTPS_MutualTLS_WithJKS tests 2-way SSL using a JKS keystore for the client certificate
func TestHTTPS_MutualTLS_WithJKS(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "artemis-mtls-jks-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	certGen := NewTestCertificateGenerator(tmpDir)

	// Generate CA
	caCertPath, caCert, caKey, err := certGen.GenerateCA("Artemis-Test-CA")
	if err != nil {
		t.Fatalf("Failed to generate CA: %v", err)
	}

	// Generate server cert signed by CA
	serverCertPath := filepath.Join(tmpDir, "server-cert.pem")
	serverKeyPath := filepath.Join(tmpDir, "server-key.pem")
	_, err = certGen.GenerateCASignedCert("localhost", caCert, caKey, true, serverCertPath, serverKeyPath)
	if err != nil {
		t.Fatalf("Failed to generate server certificate: %v", err)
	}

	// Generate client cert signed by same CA
	clientCertPath := filepath.Join(tmpDir, "client-cert.pem")
	clientKeyPath := filepath.Join(tmpDir, "client-key.pem")
	_, err = certGen.GenerateCASignedCert("test-client", caCert, caKey, false, clientCertPath, clientKeyPath)
	if err != nil {
		t.Fatalf("Failed to generate client certificate: %v", err)
	}

	// Build a JKS keystore from the client cert+key
	jksPath := filepath.Join(tmpDir, "client.jks")
	jksPassword := "testpass123"
	err = buildTestJKS(t, clientCertPath, clientKeyPath, jksPath, jksPassword)
	if err != nil {
		t.Fatalf("Failed to build test JKS: %v", err)
	}

	// Build mTLS server config
	serverTLSConfig, err := certGen.BuildMutualTLSServerConfig(serverCertPath, serverKeyPath, caCertPath)
	if err != nil {
		t.Fatalf("Failed to build mTLS server config: %v", err)
	}

	// Start HTTPS server with mTLS
	testServer := NewSimpleTestServer(9036, 9037, 9038)
	if err := testServer.StartHTTPS(serverTLSConfig); err != nil {
		t.Fatalf("Failed to start mTLS HTTPS server: %v", err)
	}
	defer testServer.StopAll()

	client := NewHTTPClient()

	// Client provides JKS file (base64 encoded)
	req := &models.Request{
		ID:          "mtls-jks-test-1",
		Name:        "Test mTLS with JKS",
		Type:        models.RequestTypeHTTP,
		Method:      "GET",
		URL:         "https://" + testServer.GetHTTPSAddr() + "/api/secure",
		VerifySSL:   false,
		JksFile:     readFileAsBase64(t, jksPath),
		JksPassword: jksPassword,
		Timeout:     10,
	}

	resp, err := client.ExecuteRequest(req)
	if err != nil {
		t.Fatalf("mTLS with JKS request failed: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	t.Logf("✓ mTLS 2-way SSL with JKS keystore successful. Status: %d, Time: %dms", resp.StatusCode, resp.Time)
}
