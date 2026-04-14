package services

import (
	"encoding/json"
	"fmt"
	"artemis/internal/models"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// EnvironmentService manages environments
type EnvironmentService struct {
	dataDir string
}

// NewEnvironmentService creates a new environment service
func NewEnvironmentService(dataDir string) *EnvironmentService {
	return &EnvironmentService{dataDir: dataDir}
}

// CreateEnvironment creates a new environment
func (es *EnvironmentService) CreateEnvironment(name string) (*models.Environment, error) {
	environment := &models.Environment{
		ID:        uuid.New().String(),
		Name:      name,
		Variables: make(map[string]string),
		Active:    false,
	}
	if err := es.saveEnvironments([]*models.Environment{environment}); err != nil {
		return nil, err
	}
	return environment, nil
}

// GetEnvironments returns all environments
func (es *EnvironmentService) GetEnvironments() ([]*models.Environment, error) {
	path := filepath.Join(es.dataDir, "environments.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []*models.Environment{}, nil
		}
		return nil, err
	}
	var environments []*models.Environment
	if err := json.Unmarshal(data, &environments); err != nil {
		return nil, err
	}
	return environments, nil
}

// GetEnvironment returns a specific environment
func (es *EnvironmentService) GetEnvironment(id string) (*models.Environment, error) {
	environments, err := es.GetEnvironments()
	if err != nil {
		return nil, err
	}
	for _, env := range environments {
		if env.ID == id {
			return env, nil
		}
	}
	return nil, fmt.Errorf("environment not found")
}

// UpdateEnvironment updates an environment
func (es *EnvironmentService) UpdateEnvironment(environment *models.Environment) error {
	environments, err := es.GetEnvironments()
	if err != nil {
		return err
	}
	for i, env := range environments {
		if env.ID == environment.ID {
			environments[i] = environment
			return es.saveEnvironments(environments)
		}
	}
	environments = append(environments, environment)
	return es.saveEnvironments(environments)
}

// DeleteEnvironment deletes an environment
func (es *EnvironmentService) DeleteEnvironment(id string) error {
	environments, err := es.GetEnvironments()
	if err != nil {
		return err
	}
	for i, env := range environments {
		if env.ID == id {
			environments = append(environments[:i], environments[i+1:]...)
			return es.saveEnvironments(environments)
		}
	}
	return fmt.Errorf("environment not found")
}

// SetActiveEnvironment sets the active environment
func (es *EnvironmentService) SetActiveEnvironment(id string) error {
	environments, err := es.GetEnvironments()
	if err != nil {
		return err
	}
	for i, env := range environments {
		env.Active = env.ID == id
		environments[i] = env
	}
	return es.saveEnvironments(environments)
}

// GetActiveEnvironment gets the active environment
func (es *EnvironmentService) GetActiveEnvironment() (*models.Environment, error) {
	environments, err := es.GetEnvironments()
	if err != nil {
		return nil, err
	}
	for _, env := range environments {
		if env.Active {
			return env, nil
		}
	}
	return nil, nil
}

// saveEnvironments saves all environments to disk
func (es *EnvironmentService) saveEnvironments(environments []*models.Environment) error {
	if err := os.MkdirAll(es.dataDir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(environments, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(es.dataDir, "environments.json")
	return os.WriteFile(path, data, 0644)
}

// ProtoFileManager manages gRPC proto files
type ProtoFileManager struct {
	protoDir string // Directory where uploaded proto files are stored
}

// NewProtoFileManager creates a new proto file manager
func NewProtoFileManager(baseDataDir string) *ProtoFileManager {
	protoDir := filepath.Join(baseDataDir, "proto-files")
	// Ensure directory exists
	os.MkdirAll(protoDir, 0755)
	return &ProtoFileManager{protoDir: protoDir}
}

// UploadProtoFile saves uploaded proto file to the proto directory
func (pfm *ProtoFileManager) UploadProtoFile(filename string, content []byte) error {
	if filename == "" {
		return fmt.Errorf("filename cannot be empty")
	}
	
	// Ensure .proto extension
	if !strings.HasSuffix(strings.ToLower(filename), ".proto") {
		filename = filename + ".proto"
	}
	
	filePath := filepath.Join(pfm.protoDir, filename)
	if err := os.WriteFile(filePath, content, 0644); err != nil {
		return err
	}
	return nil
}

// DeleteProtoFile removes a proto file from the proto directory
func (pfm *ProtoFileManager) DeleteProtoFile(filename string) error {
	filePath := filepath.Join(pfm.protoDir, filename)
	return os.Remove(filePath)
}

// ListProtoFiles returns all proto files in the proto directory
func (pfm *ProtoFileManager) ListProtoFiles() ([]string, error) {
	entries, err := os.ReadDir(pfm.protoDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}
	
	var protoFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".proto") {
			protoFiles = append(protoFiles, entry.Name())
		}
	}
	return protoFiles, nil
}

// GetProtoFilePath returns the full path for a proto file
func (pfm *ProtoFileManager) GetProtoFilePath(filename string) string {
	return filepath.Join(pfm.protoDir, filename)
}

// GetProtoDirectory returns the directory where proto files are stored
func (pfm *ProtoFileManager) GetProtoDirectory() string {
	return pfm.protoDir
}

// LoadProtoFilesFromDirectory scans a directory and returns .proto files
func (pfm *ProtoFileManager) LoadProtoFilesFromDirectory(dirPath string) ([]string, error) {
	if dirPath == "" {
		return []string{}, nil
	}
	
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}
	
	var protoFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".proto") {
			fullPath := filepath.Join(dirPath, entry.Name())
			protoFiles = append(protoFiles, fullPath)
		}
	}
	return protoFiles, nil
}
