package services

import (
	"encoding/json"
	"fmt"
	"artemis/internal/models"
	"os"
	"path/filepath"

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
