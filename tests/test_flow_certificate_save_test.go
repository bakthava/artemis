package tests

import (
	"encoding/json"
	"testing"
	"time"

	"artemis/internal/models"
)

// TestFlowCertificateSerialize verifies that Flow correctly serializes the SelectedCertificateSetID field
func TestFlowCertificateSerialize(t *testing.T) {
	tests := []struct {
		name     string
		flow     *models.Flow
		hasCert  bool
		certID   string
	}{
		{
			name: "Flow with global certificate",
			flow: &models.Flow{
				ID:                       "flow-1",
				Name:                     "Test Flow with Cert",
				SelectedCertificateSetID: "cert-set-123",
				Steps: []models.FlowStep{
					{
						ID:   "step-1",
						Type: "request",
						Name: "HTTP Request",
					},
				},
				Variables: map[string]string{},
				CreatedAt: time.Now().Unix(),
				UpdatedAt: time.Now().Unix(),
			},
			hasCert: true,
			certID:  "cert-set-123",
		},
		{
			name: "Flow without global certificate",
			flow: &models.Flow{
				ID:   "flow-2",
				Name: "Test Flow no Cert",
				Steps: []models.FlowStep{
					{
						ID:   "step-1",
						Type: "request",
						Name: "HTTP Request",
					},
				},
				Variables: map[string]string{},
				CreatedAt: time.Now().Unix(),
				UpdatedAt: time.Now().Unix(),
			},
			hasCert: false,
			certID:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Marshal to JSON
			jsonBytes, err := json.Marshal(tt.flow)
			if err != nil {
				t.Fatalf("Failed to marshal flow: %v", err)
			}

			// Unmarshal to verify structure
			var flowData map[string]interface{}
			if err := json.Unmarshal(jsonBytes, &flowData); err != nil {
				t.Fatalf("Failed to unmarshal flow: %v", err)
			}

			// Verify certificate field
			if tt.hasCert {
				if cert, ok := flowData["selectedCertificateSetId"]; !ok {
					t.Error("Expected selectedCertificateSetId field in JSON")
				} else if cert != tt.certID {
					t.Errorf("Expected certificate ID %q, got %q", tt.certID, cert)
				}
			} else {
				// Field should be omitted when empty (due to omitempty tag)
				if cert, ok := flowData["selectedCertificateSetId"]; ok {
					t.Errorf("Expected no selectedCertificateSetId field, but got %v", cert)
				}
			}
		})
	}
}

// TestFlowCertificateDeserialize verifies that Flow correctly deserializes the SelectedCertificateSetID field
func TestFlowCertificateDeserialize(t *testing.T) {
	tests := []struct {
		name        string
		jsonData    string
		expectCertID string
		expectErr   bool
	}{
		{
			name: "Valid flow with certificate",
			jsonData: `{
				"id": "flow-1",
				"name": "Test Flow",
				"selectedCertificateSetId": "cert-set-456",
				"steps": [{"id": "s1", "type": "request", "name": "Step 1"}],
				"variables": {},
				"createdAt": 1234567890,
				"updatedAt": 1234567890
			}`,
			expectCertID: "cert-set-456",
			expectErr:    false,
		},
		{
			name: "Valid flow without certificate",
			jsonData: `{
				"id": "flow-2",
				"name": "Test Flow 2",
				"steps": [{"id": "s1", "type": "request", "name": "Step 1"}],
				"variables": {},
				"createdAt": 1234567890,
				"updatedAt": 1234567890
			}`,
			expectCertID: "",
			expectErr:    false,
		},
		{
			name: "Valid flow with null certificate",
			jsonData: `{
				"id": "flow-3",
				"name": "Test Flow 3",
				"selectedCertificateSetId": null,
				"steps": [{"id": "s1", "type": "request", "name": "Step 1"}],
				"variables": {},
				"createdAt": 1234567890,
				"updatedAt": 1234567890
			}`,
			expectCertID: "",
			expectErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var flow models.Flow
			err := json.Unmarshal([]byte(tt.jsonData), &flow)

			if tt.expectErr && err == nil {
				t.Fatal("Expected error but got none")
			}
			if !tt.expectErr && err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			if flow.SelectedCertificateSetID != tt.expectCertID {
				t.Errorf("Expected certificate ID %q, got %q", tt.expectCertID, flow.SelectedCertificateSetID)
			}
		})
	}
}

// TestFlowStepCertificateIndependent verifies that step-level certificates are independent from flow-level
func TestFlowStepCertificateIndependent(t *testing.T) {
	flow := &models.Flow{
		ID:                       "flow-1",
		Name:                     "Mixed Certificate Flow",
		SelectedCertificateSetID: "global-cert-123",
		Steps: []models.FlowStep{
			{
				ID:                      "step-1",
				Type:                    "request",
				Name:                    "Step with override cert",
				SelectedCertificateSetID: "step-cert-456",
			},
			{
				ID:   "step-2",
				Type: "request",
				Name: "Step without cert (uses global)",
				// No SelectedCertificateSetID - should use flow-level
			},
		},
		Variables: map[string]string{},
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}

	// Marshal and verify
	jsonBytes, _ := json.Marshal(flow)
	var flowData map[string]interface{}
	json.Unmarshal(jsonBytes, &flowData)

	// Check global certificate
	if cert, ok := flowData["selectedCertificateSetId"]; !ok || cert != "global-cert-123" {
		t.Error("Global certificate not properly serialized")
	}

	// Check step certificates
	steps := flowData["steps"].([]interface{})
	if step1, ok := steps[0].(map[string]interface{}); ok {
		if cert, ok := step1["selectedCertificateSetId"]; !ok || cert != "step-cert-456" {
			t.Error("Step 1 certificate not properly serialized")
		}
	}

	// Step 2 should not have certificate field (omitempty)
	if step2, ok := steps[1].(map[string]interface{}); ok {
		if _, ok := step2["selectedCertificateSetId"]; ok {
			t.Error("Step 2 should not have certificate field in JSON (should use global)")
		}
	}
}

// TestFlowCertificateRoundTrip verifies save and load cycle
func TestFlowCertificateRoundTrip(t *testing.T) {
	original := &models.Flow{
		ID:                       "flow-rt-1",
		Name:                     "Round Trip Test",
		SelectedCertificateSetID: "cert-rt-123",
		Steps: []models.FlowStep{
			{
				ID:                       "step-1",
				Type:                     "request",
				Name:                     "Overridden",
				SelectedCertificateSetID: "cert-rt-override",
			},
		},
		Variables: map[string]string{"var1": "value1"},
		CreatedAt: time.Now().Unix(),
		UpdatedAt: time.Now().Unix(),
	}

	// Simulate save: marshal to JSON
	jsonBytes, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	// Simulate load: unmarshal from JSON
	var loaded models.Flow
	if err := json.Unmarshal(jsonBytes, &loaded); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	// Verify round trip
	if loaded.SelectedCertificateSetID != original.SelectedCertificateSetID {
		t.Errorf("Flow certificate changed: %q -> %q", 
			original.SelectedCertificateSetID, loaded.SelectedCertificateSetID)
	}

	if len(loaded.Steps) > 0 {
		if loaded.Steps[0].SelectedCertificateSetID != original.Steps[0].SelectedCertificateSetID {
			t.Errorf("Step certificate changed: %q -> %q",
				original.Steps[0].SelectedCertificateSetID, loaded.Steps[0].SelectedCertificateSetID)
		}
	}
}
