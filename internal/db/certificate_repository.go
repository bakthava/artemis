package db

import (
	"artemis/internal/models"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// CertificateRepository manages certificate storage
type CertificateRepository struct {
	db *DB
}

// NewCertificateRepository creates a new certificate repository
func NewCertificateRepository(db *DB) *CertificateRepository {
	return &CertificateRepository{db: db}
}

// SaveCertificate stores a certificate
func (r *CertificateRepository) SaveCertificate(cert *models.Certificate) error {
	if cert.ID == "" {
		cert.ID = uuid.New().String()
	}
	if cert.CreatedAt.IsZero() {
		cert.CreatedAt = time.Now()
	}

	key := fmt.Sprintf("certificate:%s", cert.ID)
	return r.db.SetJSON(key, cert)
}

// GetCertificate retrieves a certificate by ID
func (r *CertificateRepository) GetCertificate(id string) (*models.Certificate, error) {
	var cert models.Certificate
	key := fmt.Sprintf("certificate:%s", id)
	if err := r.db.GetJSON(key, &cert); err != nil {
		return nil, fmt.Errorf("certificate not found: %w", err)
	}
	return &cert, nil
}

// ListCertificates retrieves all certificates
func (r *CertificateRepository) ListCertificates() ([]*models.Certificate, error) {
	certs := []*models.Certificate{}
	iter := r.db.conn.NewIterator(nil, nil)
	defer iter.Release()

	for iter.Next() {
		key := string(iter.Key())
		if len(key) > 12 && key[:12] == "certificate:" {
			var cert models.Certificate
			if err := r.db.GetJSON(key, &cert); err == nil {
				certs = append(certs, &cert)
			}
		}
	}

	if err := iter.Error(); err != nil {
		return nil, err
	}

	return certs, nil
}

// DeleteCertificate removes a certificate
func (r *CertificateRepository) DeleteCertificate(id string) error {
	key := fmt.Sprintf("certificate:%s", id)
	return r.db.DeleteValue(key)
}

// SaveCertificateSet stores a certificate set (grouped certificates)
func (r *CertificateRepository) SaveCertificateSet(set *models.CertificateSet) error {
	if set.ID == "" {
		set.ID = uuid.New().String()
	}
	if set.CreatedAt.IsZero() {
		set.CreatedAt = time.Now()
	}

	key := fmt.Sprintf("certificate_set:%s", set.ID)
	return r.db.SetJSON(key, set)
}

// GetCertificateSet retrieves a certificate set by ID
func (r *CertificateRepository) GetCertificateSet(id string) (*models.CertificateSet, error) {
	var set models.CertificateSet
	key := fmt.Sprintf("certificate_set:%s", id)
	if err := r.db.GetJSON(key, &set); err != nil {
		return nil, fmt.Errorf("certificate set not found: %w", err)
	}
	return &set, nil
}

// ListCertificateSets retrieves all certificate sets
func (r *CertificateRepository) ListCertificateSets() ([]*models.CertificateSet, error) {
	sets := []*models.CertificateSet{}
	iter := r.db.conn.NewIterator(nil, nil)
	defer iter.Release()

	for iter.Next() {
		key := string(iter.Key())
		if strings.HasPrefix(key, "certificate_set:") {
			var set models.CertificateSet
			if err := r.db.GetJSON(key, &set); err == nil {
				sets = append(sets, &set)
			}
		}
	}

	if err := iter.Error(); err != nil {
		return nil, err
	}

	return sets, nil
}

// DeleteCertificateSet removes a certificate set
func (r *CertificateRepository) DeleteCertificateSet(id string) error {
	key := fmt.Sprintf("certificate_set:%s", id)
	return r.db.DeleteValue(key)
}
