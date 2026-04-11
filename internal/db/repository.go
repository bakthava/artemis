package db

import (
	"encoding/json"
	"fmt"
	"artemis/internal/models"
	"time"

	"github.com/google/uuid"
	"github.com/syndtr/goleveldb/leveldb"
	"github.com/syndtr/goleveldb/leveldb/util"
)

// CollectionRepository handles collection persistence
type CollectionRepository struct {
	db *DB
}

// NewCollectionRepository creates a new repository
func NewCollectionRepository(db *DB) *CollectionRepository {
	return &CollectionRepository{db: db}
}

// Create inserts a new collection
func (r *CollectionRepository) Create(name string) (*models.Collection, error) {
	id := uuid.New().String()
	now := time.Now().Unix()

	collection := &models.Collection{
		ID:       id,
		Name:     name,
		Requests: []*models.Request{},
	}

	// Store collection metadata
	meta := map[string]interface{}{
		"id":         id,
		"name":       name,
		"created_at": now,
		"updated_at": now,
	}

	key := fmt.Sprintf("collection:%s", id)
	if err := r.db.SetJSON(key, meta); err != nil {
		return nil, err
	}

	// Store empty requests list
	if err := r.db.SetJSON(fmt.Sprintf("collection:%s:requests", id), []string{}); err != nil {
		return nil, err
	}

	return collection, nil
}

// GetAll retrieves all collections with their requests
func (r *CollectionRepository) GetAll() ([]*models.Collection, error) {
	var collections []*models.Collection

	// Iterate over all collections
	iter := r.db.conn.NewIterator(util.BytesPrefix([]byte("collection:")), nil)
	defer iter.Release()

	visited := make(map[string]bool)

	for iter.Next() {
		key := string(iter.Key())

		// Skip nested keys (only process collection:{id} keys)
		if len(key) > len("collection:") {
			remaining := key[len("collection:"):]
			// Check if it's a top-level key (no colons after the ID part)
			colonPos := -1
			for i, ch := range remaining {
				if ch == ':' {
					colonPos = i
					break
				}
			}
			if colonPos != -1 {
				continue // Skip nested keys like collection:{id}:requests
			}

			// Extract ID to avoid duplicates
			id := remaining
			if visited[id] {
				continue
			}
			visited[id] = true
		} else {
			continue
		}

		var meta map[string]interface{}
		if err := json.Unmarshal(iter.Value(), &meta); err != nil {
			continue
		}

		name, ok := meta["name"].(string)
		if !ok {
			continue
		}

		remaining := key[len("collection:"):]
		colonPos := -1
		for i, ch := range remaining {
			if ch == ':' {
				colonPos = i
				break
			}
		}

		var id string
		if colonPos != -1 {
			id = remaining[:colonPos]
		} else {
			id = remaining
		}

		// Get requests for this collection
		reqs, err := r.getRequestsByCollectionID(id)
		if err != nil {
			reqs = []*models.Request{}
		}

		collections = append(collections, &models.Collection{
			ID:       id,
			Name:     name,
			Requests: reqs,
		})
	}

	if err := iter.Error(); err != nil {
		return nil, err
	}

	return collections, nil
}

// GetByID retrieves a specific collection
func (r *CollectionRepository) GetByID(id string) (*models.Collection, error) {
	var meta map[string]interface{}
	key := fmt.Sprintf("collection:%s", id)
	if err := r.db.GetJSON(key, &meta); err != nil {
		if err == leveldb.ErrNotFound {
			return nil, nil
		}
		return nil, err
	}

	name, ok := meta["name"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid collection metadata")
	}

	reqs, err := r.getRequestsByCollectionID(id)
	if err != nil {
		reqs = []*models.Request{}
	}

	return &models.Collection{
		ID:       id,
		Name:     name,
		Requests: reqs,
	}, nil
}

// Update updates a collection name
func (r *CollectionRepository) Update(id, name string) error {
	var meta map[string]interface{}
	key := fmt.Sprintf("collection:%s", id)

	if err := r.db.GetJSON(key, &meta); err != nil {
		return err
	}

	meta["name"] = name
	meta["updated_at"] = time.Now().Unix()

	return r.db.SetJSON(key, meta)
}

// Delete removes a collection and its requests
func (r *CollectionRepository) Delete(id string) error {
	// Get request IDs to delete
	var requestIDs []string
	reqKey := fmt.Sprintf("collection:%s:requests", id)
	if err := r.db.GetJSON(reqKey, &requestIDs); err == nil {
		// Delete each request and related data
		for _, reqID := range requestIDs {
			_ = r.db.DeleteValue(fmt.Sprintf("request:%s", reqID))
			_ = r.db.DeleteValue(fmt.Sprintf("request:%s:headers", reqID))
			_ = r.db.DeleteValue(fmt.Sprintf("request:%s:params", reqID))
			_ = r.db.DeleteValue(fmt.Sprintf("request:%s:auth", reqID))
		}
	}

	// Delete collection
	colKey := fmt.Sprintf("collection:%s", id)
	_ = r.db.DeleteValue(colKey)
	_ = r.db.DeleteValue(reqKey)

	return nil
}

// AddRequest adds a request to a collection
func (r *CollectionRepository) AddRequest(collectionID string, request *models.Request) error {
	// Store request
	reqKey := fmt.Sprintf("request:%s", request.ID)
	if err := r.db.SetJSON(reqKey, request); err != nil {
		return err
	}

	// Store headers
	if err := r.db.SetJSON(fmt.Sprintf("request:%s:headers", request.ID), request.Headers); err != nil {
		return err
	}

	// Store query params
	if err := r.db.SetJSON(fmt.Sprintf("request:%s:params", request.ID), request.QueryParams); err != nil {
		return err
	}

	// Store auth
	if request.Auth != nil {
		if err := r.db.SetJSON(fmt.Sprintf("request:%s:auth", request.ID), request.Auth); err != nil {
			return err
		}
	}

	// Add request ID to collection's requests list
	var requestIDs []string
	reqListKey := fmt.Sprintf("collection:%s:requests", collectionID)
	_ = r.db.GetJSON(reqListKey, &requestIDs) // Ignore error if list doesn't exist

	requestIDs = append(requestIDs, request.ID)
	return r.db.SetJSON(reqListKey, requestIDs)
}

// getRequestsByCollectionID retrieves all requests in a collection
func (r *CollectionRepository) getRequestsByCollectionID(collectionID string) ([]*models.Request, error) {
	var requestIDs []string
	reqListKey := fmt.Sprintf("collection:%s:requests", collectionID)

	if err := r.db.GetJSON(reqListKey, &requestIDs); err != nil {
		if err == leveldb.ErrNotFound {
			return []*models.Request{}, nil
		}
		return nil, err
	}

	var requests []*models.Request
	for _, reqID := range requestIDs {
		var req models.Request
		reqKey := fmt.Sprintf("request:%s", reqID)
		if err := r.db.GetJSON(reqKey, &req); err != nil {
			continue
		}

		// Load headers
		var headers map[string]string
		_ = r.db.GetJSON(fmt.Sprintf("request:%s:headers", reqID), &headers)
		req.Headers = headers

		// Load params
		var params map[string]string
		_ = r.db.GetJSON(fmt.Sprintf("request:%s:params", reqID), &params)
		req.QueryParams = params

		// Load auth
		var auth models.Auth
		if err := r.db.GetJSON(fmt.Sprintf("request:%s:auth", reqID), &auth); err == nil {
			req.Auth = &auth
		}

		requests = append(requests, &req)
	}

	return requests, nil
}

// EnvironmentRepository handles environment persistence
type EnvironmentRepository struct {
	db *DB
}

// NewEnvironmentRepository creates a new repository
func NewEnvironmentRepository(db *DB) *EnvironmentRepository {
	return &EnvironmentRepository{db: db}
}

// Create inserts a new environment
func (r *EnvironmentRepository) Create(name string) (*models.Environment, error) {
	id := uuid.New().String()
	now := time.Now().Unix()

	meta := map[string]interface{}{
		"id":         id,
		"name":       name,
		"active":     false,
		"created_at": now,
		"updated_at": now,
	}

	key := fmt.Sprintf("environment:%s", id)
	if err := r.db.SetJSON(key, meta); err != nil {
		return nil, err
	}

	// Store empty variables
	if err := r.db.SetJSON(fmt.Sprintf("environment:%s:variables", id), map[string]string{}); err != nil {
		return nil, err
	}

	return &models.Environment{
		ID:        id,
		Name:      name,
		Variables: make(map[string]string),
		Active:    false,
	}, nil
}

// GetAll retrieves all environments
func (r *EnvironmentRepository) GetAll() ([]*models.Environment, error) {
	var environments []*models.Environment
	visited := make(map[string]bool)

	iter := r.db.conn.NewIterator(util.BytesPrefix([]byte("environment:")), nil)
	defer iter.Release()

	for iter.Next() {
		key := string(iter.Key())

		// Skip nested keys
		if len(key) > len("environment:") {
			remaining := key[len("environment:"):]
			colonPos := -1
			for i, ch := range remaining {
				if ch == ':' {
					colonPos = i
					break
				}
			}
			if colonPos != -1 {
				continue
			}

			id := remaining
			if visited[id] {
				continue
			}
			visited[id] = true
		} else {
			continue
		}

		var meta map[string]interface{}
		if err := json.Unmarshal(iter.Value(), &meta); err != nil {
			continue
		}

		name, _ := meta["name"].(string)
		active, _ := meta["active"].(bool)

		remaining := key[len("environment:"):]
		colonPos := -1
		for i, ch := range remaining {
			if ch == ':' {
				colonPos = i
				break
			}
		}

		var id string
		if colonPos != -1 {
			id = remaining[:colonPos]
		} else {
			id = remaining
		}

		// Load variables
		var variables map[string]string
		_ = r.db.GetJSON(fmt.Sprintf("environment:%s:variables", id), &variables)
		if variables == nil {
			variables = make(map[string]string)
		}

		environments = append(environments, &models.Environment{
			ID:        id,
			Name:      name,
			Variables: variables,
			Active:    active,
		})
	}

	return environments, iter.Error()
}

// Update updates environment variables
func (r *EnvironmentRepository) Update(id string, variables map[string]string) error {
	var meta map[string]interface{}
	key := fmt.Sprintf("environment:%s", id)

	if err := r.db.GetJSON(key, &meta); err != nil {
		return err
	}

	meta["updated_at"] = time.Now().Unix()
	if err := r.db.SetJSON(key, meta); err != nil {
		return err
	}

	return r.db.SetJSON(fmt.Sprintf("environment:%s:variables", id), variables)
}

// SetActive sets the active environment
func (r *EnvironmentRepository) SetActive(id string) error {
	// First, deactivate all environments
	iter := r.db.conn.NewIterator(util.BytesPrefix([]byte("environment:")), nil)
	defer iter.Release()

	visited := make(map[string]bool)
	for iter.Next() {
		key := string(iter.Key())

		if len(key) > len("environment:") {
			remaining := key[len("environment:"):]
			colonPos := -1
			for i, ch := range remaining {
				if ch == ':' {
					colonPos = i
					break
				}
			}
			if colonPos != -1 {
				continue
			}

			envID := remaining
			if visited[envID] {
				continue
			}
			visited[envID] = true

			var meta map[string]interface{}
			if err := json.Unmarshal(iter.Value(), &meta); err != nil {
				continue
			}

			meta["active"] = false
			meta["updated_at"] = time.Now().Unix()
			_ = r.db.SetJSON(fmt.Sprintf("environment:%s", envID), meta)
		}
	}

	// Set the target environment as active
	var meta map[string]interface{}
	key := fmt.Sprintf("environment:%s", id)
	if err := r.db.GetJSON(key, &meta); err != nil {
		return err
	}

	meta["active"] = true
	meta["updated_at"] = time.Now().Unix()
	if err := r.db.SetJSON(key, meta); err != nil {
		return err
	}

	return r.db.SetActiveEnvironment(id)
}

// Delete removes an environment
func (r *EnvironmentRepository) Delete(id string) error {
	_ = r.db.DeleteValue(fmt.Sprintf("environment:%s", id))
	_ = r.db.DeleteValue(fmt.Sprintf("environment:%s:variables", id))
	return nil
}

// HistoryRepository handles history persistence
type HistoryRepository struct {
	db *DB
}

// NewHistoryRepository creates a new repository
func NewHistoryRepository(db *DB) *HistoryRepository {
	return &HistoryRepository{db: db}
}

// Add adds an entry to the history
func (r *HistoryRepository) Add(request *models.Request, response *models.Response) error {
	id := uuid.New().String()
	now := time.Now().Unix()

	entry := &models.HistoryEntry{
		ID:        id,
		Request:   request,
		Response:  response,
		Timestamp: now,
	}

	key := fmt.Sprintf("history:%s", id)
	if err := r.db.SetJSON(key, entry); err != nil {
		return err
	}

	// Add to history list (with limit of 100 entries)
	var historyIDs []string
	_ = r.db.GetJSON("history:list", &historyIDs)

	historyIDs = append([]string{id}, historyIDs...)
	if len(historyIDs) > 100 {
		// Remove oldest entries
		for _, oldID := range historyIDs[100:] {
			_ = r.db.DeleteValue(fmt.Sprintf("history:%s", oldID))
		}
		historyIDs = historyIDs[:100]
	}

	return r.db.SetJSON("history:list", historyIDs)
}

// GetRecent retrieves recent history entries
func (r *HistoryRepository) GetRecent(limit, offset int) ([]*models.HistoryEntry, error) {
	var historyIDs []string
	if err := r.db.GetJSON("history:list", &historyIDs); err != nil {
		if err == leveldb.ErrNotFound {
			return []*models.HistoryEntry{}, nil
		}
		return nil, err
	}

	var entries []*models.HistoryEntry
	start := offset
	end := offset + limit

	if start > len(historyIDs) {
		return []*models.HistoryEntry{}, nil
	}

	if end > len(historyIDs) {
		end = len(historyIDs)
	}

	for _, id := range historyIDs[start:end] {
		var entry models.HistoryEntry
		key := fmt.Sprintf("history:%s", id)
		if err := r.db.GetJSON(key, &entry); err != nil {
			continue
		}
		entries = append(entries, &entry)
	}

	return entries, nil
}

// Clear removes all history
func (r *HistoryRepository) Clear() error {
	var historyIDs []string
	_ = r.db.GetJSON("history:list", &historyIDs)

	for _, id := range historyIDs {
		_ = r.db.DeleteValue(fmt.Sprintf("history:%s", id))
	}

	return r.db.DeleteValue("history:list")
}
