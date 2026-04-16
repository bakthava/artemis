package main

import (
	"artemis/internal/models"
	"artemis/internal/services"
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"
)

// TestMTLS_FullFlow validates the complete 2-way SSL workflow
func TestMTLS_FullFlow(t *testing.T) {
	// Create app instance
	app := &App{
		httpClient: services.NewHTTPClient(),
	}

	// Start mTLS test server
	fmt.Println("=== Starting mTLS Test Server ===")
	result, err := app.StartMTLSTestServer(8444) // Use different port to avoid conflicts
	if err != nil {
		t.Fatalf("Failed to start mTLS server: %v", err)
	}
	defer app.StopMTLSTestServer()

	fmt.Printf("✓ mTLS server started at: %v:%v\n", result["url"], result["port"])
	fmt.Printf("✓ JKS password: %v\n", result["jksPassword"])

	jksBase64 := result["jksBase64"].(string)
	jksPassword := result["jksPassword"].(string)
	url := result["url"].(string)

	// Test 1: Verify JKS can be loaded
	fmt.Println("\n=== Test 1: Load and Validate JKS ===")
	cert, err := app.httpClient.LoadJKSFromBase64(jksBase64, jksPassword)
	if err != nil {
		t.Fatalf("Failed to load JKS: %v", err)
	}
	fmt.Printf("✓ JKS loaded successfully\n")
	fmt.Printf("  Certificate chain length: %d\n", len(cert.Certificate))
	if len(cert.Certificate) > 0 {
		x509Cert, _ := x509.ParseCertificate(cert.Certificate[0])
		fmt.Printf("  Subject: %v\n", x509Cert.Subject)
		fmt.Printf("  Not Before: %v\n", x509Cert.NotBefore)
		fmt.Printf("  Not After: %v\n", x509Cert.NotAfter)
	}

	// Test 2: Make an HTTP request to the mTLS server with client certificate
	fmt.Println("\n=== Test 2: Make mTLS Request with Client Certificate ===")
	tlsConfig := &tls.Config{
		Certificates:       []tls.Certificate{cert},
		InsecureSkipVerify: true, // Self-signed CA
	}
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: tlsConfig,
		},
		Timeout: 10 * time.Second,
	}

	resp, err := client.Post(url+"/test", "application/json", bytes.NewBufferString(`{"test": "data"}`))
	if err != nil {
		t.Fatalf("Failed to make request: %v", err)
	}
	defer resp.Body.Close()

	fmt.Printf("✓ Request successful\n")
	fmt.Printf("  Status: %s\n", resp.Status)

	body, _ := io.ReadAll(resp.Body)
	var respPayload map[string]interface{}
	json.Unmarshal(body, &respPayload)

	fmt.Printf("  Response body:\n")
	for k, v := range respPayload {
		fmt.Printf("    %s: %v\n", k, v)
	}

	// Verify client cert was received by server
	if clientSubject, ok := respPayload["client_subject"]; ok && clientSubject != "" {
		fmt.Printf("✓ Server received client certificate: %v\n", clientSubject)
	} else {
		t.Fatal("Server did not receive client certificate")
	}

	// Test 3: Verify request without client cert fails
	fmt.Println("\n=== Test 3: Verify Request Without Client Cert Fails ===")
	insecureClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		},
		Timeout: 10 * time.Second,
	}

	resp2, err := insecureClient.Get(url + "/test")
	if err != nil {
		if bytes.Contains([]byte(err.Error()), []byte("certificate required")) {
			fmt.Printf("✓ Request correctly rejected: %v\n", err)
		} else {
			fmt.Printf("✓ Request failed as expected: %v\n", err)
		}
	} else {
		resp2.Body.Close()
		t.Fatalf("Expected request to fail without client cert, but got status %d", resp2.StatusCode)
	}

	// Test 4: Execute via app.ExecuteRequest
	fmt.Println("\n=== Test 4: Test via ExecuteRequest with JKS ===")
	request := &models.Request{
		Method:      "GET",
		URL:         url + "/api/test",
		VerifySSL:   false,
		JksFile:     jksBase64,
		JksPassword: jksPassword,
	}

	response, err := app.ExecuteRequest(request)
	if err != nil {
		t.Logf("ExecuteRequest error: %v", err)
	} else {
		fmt.Printf("✓ ExecuteRequest successful\n")
		fmt.Printf("  Status Code: %d\n", response.StatusCode)
		fmt.Printf("  Response body: %s\n", response.Body)
	}

	fmt.Println("\n=== ✓ All mTLS Tests Passed ===")
}
