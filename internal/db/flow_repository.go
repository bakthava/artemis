package db

import (
	"artemis/internal/models"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/syndtr/goleveldb/leveldb/util"
)

// FlowRepository handles persistence for flows
type FlowRepository struct {
	db *DB
}

// NewFlowRepository creates a new flow repository
func NewFlowRepository(db *DB) *FlowRepository {
	return &FlowRepository{db: db}
}

// Create saves a new flow and returns it with assigned ID/timestamps
func (r *FlowRepository) Create(flow *models.Flow) (*models.Flow, error) {
	if flow.ID == "" {
		flow.ID = uuid.New().String()
	}
	now := time.Now().Unix()
	flow.CreatedAt = now
	flow.UpdatedAt = now
	if flow.Steps == nil {
		flow.Steps = []models.FlowStep{}
	}
	if flow.Variables == nil {
		flow.Variables = map[string]string{}
	}
	key := fmt.Sprintf("flow:%s", flow.ID)
	if err := r.db.SetJSON(key, flow); err != nil {
		return nil, err
	}
	return flow, nil
}

// GetAll retrieves all stored flows
func (r *FlowRepository) GetAll() ([]*models.Flow, error) {
	var flows []*models.Flow
	iter := r.db.conn.NewIterator(util.BytesPrefix([]byte("flow:")), nil)
	defer iter.Release()
	for iter.Next() {
		var f models.Flow
		if err := json.Unmarshal(iter.Value(), &f); err != nil {
			continue
		}
		flows = append(flows, &f)
	}
	if flows == nil {
		flows = []*models.Flow{}
	}
	return flows, nil
}

// GetByID retrieves a single flow by its ID
func (r *FlowRepository) GetByID(id string) (*models.Flow, error) {
	key := fmt.Sprintf("flow:%s", id)
	var f models.Flow
	if err := r.db.GetJSON(key, &f); err != nil {
		return nil, fmt.Errorf("flow not found: %s", id)
	}
	return &f, nil
}

// Update overwrites an existing flow
func (r *FlowRepository) Update(flow *models.Flow) (*models.Flow, error) {
	flow.UpdatedAt = time.Now().Unix()
	key := fmt.Sprintf("flow:%s", flow.ID)
	if err := r.db.SetJSON(key, flow); err != nil {
		return nil, err
	}
	return flow, nil
}

// Delete removes a flow by ID
func (r *FlowRepository) Delete(id string) error {
	key := fmt.Sprintf("flow:%s", id)
	return r.db.conn.Delete([]byte(key), nil)
}
