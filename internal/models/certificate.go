package models

import "time"

// CertificateType represents the type of certificate file
type CertificateType string

const (
	CertificateTypePublic     CertificateType = "certificate"
	CertificateTypePrivateKey CertificateType = "privatekey"
	CertificateTypeCA         CertificateType = "ca"
	CertificateTypeJKS        CertificateType = "jks"
)

// Certificate represents a stored certificate
type Certificate struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Type      CertificateType `json:"type"`
	Content   string          `json:"content"` // base64 encoded
	Filename  string          `json:"filename"`
	CreatedAt time.Time       `json:"createdAt"`
	Tags      []string        `json:"tags"` // for organization (e.g., "http", "grpc", "localhost:8443")
}

// CertificateSet represents a group of related certificates (cert + key + ca)
type CertificateSet struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	CertificateID string    `json:"certificateId"` // Public certificate
	KeyID         string    `json:"keyId"`         // Private key
	CACertID      string    `json:"caCertId"`      // CA certificate (optional)
	JksID         string    `json:"jksId"`         // JKS file (optional)
	JksPassword   string    `json:"jksPassword"`   // JKS password
	CreatedAt     time.Time `json:"createdAt"`
	Tags          []string  `json:"tags"`
}
