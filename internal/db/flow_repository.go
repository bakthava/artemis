package db

import (
	"artemis/internal/models"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/syndtr/goleveldb/leveldb/util"
)

// FlowRepository handles persistence for flows
type FlowRepository struct {
	db *DB
}

const MaxFlowsPerProject = 200

// FlowQueryOptions defines optional server-side query controls for listing flows.
type FlowQueryOptions struct {
	Name   string
	Sort   string
	Limit  int
	Offset int
}

// NewFlowRepository creates a new flow repository
func NewFlowRepository(db *DB) *FlowRepository {
	return &FlowRepository{db: db}
}

// Create saves a new flow and returns it with assigned ID/timestamps
func (r *FlowRepository) Create(flow *models.Flow) (*models.Flow, error) {
	count, err := r.countFlows()
	if err != nil {
		return nil, err
	}
	if count >= MaxFlowsPerProject {
		return nil, errors.New("flow limit reached (max 200 per project)")
	}

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

func (r *FlowRepository) countFlows() (int, error) {
	count := 0
	iter := r.db.conn.NewIterator(util.BytesPrefix([]byte("flow:")), nil)
	defer iter.Release()
	for iter.Next() {
		count++
	}
	if err := iter.Error(); err != nil {
		return 0, err
	}
	return count, nil
}

// GetAll retrieves all stored flows
func (r *FlowRepository) GetAll() ([]*models.Flow, error) {
	return r.GetAllWithOptions(FlowQueryOptions{})
}

// GetAllWithOptions retrieves stored flows with optional filtering/sorting/pagination.
func (r *FlowRepository) GetAllWithOptions(options FlowQueryOptions) ([]*models.Flow, error) {
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

	// Filter by flow name (case-insensitive contains)
	nameQuery := strings.TrimSpace(strings.ToLower(options.Name))
	if nameQuery != "" {
		filtered := make([]*models.Flow, 0, len(flows))
		for _, f := range flows {
			if strings.Contains(strings.ToLower(f.Name), nameQuery) {
				filtered = append(filtered, f)
			}
		}
		flows = filtered
	}

	// Sort results
	switch options.Sort {
	case "name-asc":
		sort.SliceStable(flows, func(i, j int) bool {
			return strings.ToLower(flows[i].Name) < strings.ToLower(flows[j].Name)
		})
	case "name-desc":
		sort.SliceStable(flows, func(i, j int) bool {
			return strings.ToLower(flows[i].Name) > strings.ToLower(flows[j].Name)
		})
	case "updated-asc":
		sort.SliceStable(flows, func(i, j int) bool {
			return flows[i].UpdatedAt < flows[j].UpdatedAt
		})
	case "steps-desc":
		sort.SliceStable(flows, func(i, j int) bool {
			li := len(flows[i].Steps)
			lj := len(flows[j].Steps)
			if li == lj {
				return flows[i].UpdatedAt > flows[j].UpdatedAt
			}
			return li > lj
		})
	default:
		// updated-desc (default)
		sort.SliceStable(flows, func(i, j int) bool {
			return flows[i].UpdatedAt > flows[j].UpdatedAt
		})
	}

	// Pagination
	offset := options.Offset
	if offset < 0 {
		offset = 0
	}
	if offset >= len(flows) {
		return []*models.Flow{}, nil
	}
	limit := options.Limit
	if limit <= 0 {
		return flows[offset:], nil
	}
	end := offset + limit
	if end > len(flows) {
		end = len(flows)
	}
	return flows[offset:end], nil
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
