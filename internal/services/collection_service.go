package services

import (
	"encoding/json"
	"fmt"
	"artemis/internal/models"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

// CollectionService manages collections
type CollectionService struct {
	dataDir string
}

// NewCollectionService creates a new collection service
func NewCollectionService(dataDir string) *CollectionService {
	return &CollectionService{dataDir: dataDir}
}

// CreateCollection creates a new collection
func (cs *CollectionService) CreateCollection(name string) (*models.Collection, error) {
	collection := &models.Collection{
		ID:       uuid.New().String(),
		Name:     name,
		Requests: []*models.Request{},
	}
	if err := cs.saveCollection(collection); err != nil {
		return nil, err
	}
	return collection, nil
}

// GetCollections returns all collections
func (cs *CollectionService) GetCollections() ([]*models.Collection, error) {
	files, err := os.ReadDir(cs.dataDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []*models.Collection{}, nil
		}
		return nil, err
	}

	var collections []*models.Collection
	for _, file := range files {
		if file.IsDir() {
			continue
		}
		if filepath.Ext(file.Name()) == ".json" && file.Name() != "environments.json" && file.Name() != "history.json" {
			data, err := os.ReadFile(filepath.Join(cs.dataDir, file.Name()))
			if err != nil {
				continue
			}
			var collection models.Collection
			if err := json.Unmarshal(data, &collection); err == nil {
				collections = append(collections, &collection)
			}
		}
	}
	return collections, nil
}

// GetCollection returns a specific collection
func (cs *CollectionService) GetCollection(id string) (*models.Collection, error) {
	path := filepath.Join(cs.dataDir, id+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("collection not found: %w", err)
	}
	var collection models.Collection
	if err := json.Unmarshal(data, &collection); err != nil {
		return nil, err
	}
	return &collection, nil
}

// UpdateCollection updates a collection
func (cs *CollectionService) UpdateCollection(collection *models.Collection) error {
	return cs.saveCollection(collection)
}

// DeleteCollection deletes a collection
func (cs *CollectionService) DeleteCollection(id string) error {
	path := filepath.Join(cs.dataDir, id+".json")
	return os.Remove(path)
}

// AddRequestToCollection adds a request to a collection
func (cs *CollectionService) AddRequestToCollection(collectionID string, request *models.Request) error {
	collection, err := cs.GetCollection(collectionID)
	if err != nil {
		return err
	}
	request.ID = uuid.New().String()
	collection.Requests = append(collection.Requests, request)
	return cs.saveCollection(collection)
}

// UpdateRequestInCollection updates a request in a collection
func (cs *CollectionService) UpdateRequestInCollection(collectionID string, request *models.Request) error {
	collection, err := cs.GetCollection(collectionID)
	if err != nil {
		return err
	}
	for i, req := range collection.Requests {
		if req.ID == request.ID {
			collection.Requests[i] = request
			return cs.saveCollection(collection)
		}
	}
	return fmt.Errorf("request not found")
}

// DeleteRequestFromCollection deletes a request from a collection
func (cs *CollectionService) DeleteRequestFromCollection(collectionID, requestID string) error {
	collection, err := cs.GetCollection(collectionID)
	if err != nil {
		return err
	}
	for i, req := range collection.Requests {
		if req.ID == requestID {
			collection.Requests = append(collection.Requests[:i], collection.Requests[i+1:]...)
			return cs.saveCollection(collection)
		}
	}
	return fmt.Errorf("request not found")
}

// saveCollection saves a collection to disk
func (cs *CollectionService) saveCollection(collection *models.Collection) error {
	if err := os.MkdirAll(cs.dataDir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(collection, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(cs.dataDir, collection.ID+".json")
	return os.WriteFile(path, data, 0644)
}
