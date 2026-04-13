package main

import (
	"artemis/internal/db"
	"artemis/internal/models"
	"artemis/internal/services"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Config struct for application settings
type Config struct {
	Port           int    `json:"port"`
	Host           string `json:"host"`
	Timeout        int    `json:"timeout"`
	MaxHistorySize int    `json:"maxHistorySize"`
	DBPath         string `json:"dbPath"`
}

// App struct
type App struct {
	ctx                   context.Context
	config                *Config
	database              *db.DB
	collectionRepository  *db.CollectionRepository
	environmentRepository *db.EnvironmentRepository
	historyRepository     *db.HistoryRepository
	flowRepository        *db.FlowRepository
	httpClient            *services.HTTPClient
}

// NewApp creates a new App application struct
func NewApp(config *Config) *App {
	return &App{
		config: config,
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize database
	database, err := db.New()
	if err != nil {
		fmt.Printf("Error initializing database: %v\n", err)
		return
	}
	a.database = database

	// Initialize repositories
	a.collectionRepository = db.NewCollectionRepository(database)
	a.environmentRepository = db.NewEnvironmentRepository(database)
	a.historyRepository = db.NewHistoryRepository(database)
	a.flowRepository = db.NewFlowRepository(database)

	// Initialize HTTP client
	a.httpClient = services.NewHTTPClient()
}

// ExecuteRequest executes an HTTP request
func (a *App) ExecuteRequest(req *models.Request) (*models.Response, error) {
	response, err := a.httpClient.ExecuteRequest(req)
	if err != nil {
		if response == nil {
			response = &models.Response{
				StatusCode:     0,
				Status:         "Error",
				Headers:        map[string]string{},
				Body:           err.Error(),
				Size:           int64(len(err.Error())),
				Time:           0,
				ConnectionTime: 0,
				NetworkTime:    0,
				ResponseTime:   0,
				Protocol:       req.HTTPVersion,
				LogLevel:       req.LogLevel,
				Logs:           []string{"[ERROR] request failed"},
				Timestamp:      time.Now().Unix(),
			}
		}
		_ = a.historyRepository.Add(req, response)
		return response, err
	}
	// Add to history
	_ = a.historyRepository.Add(req, response)
	return response, nil
}

// Collections methods
func (a *App) CreateCollection(name string) (*models.Collection, error) {
	return a.collectionRepository.Create(name)
}

func (a *App) GetCollections() ([]*models.Collection, error) {
	return a.collectionRepository.GetAll()
}

func (a *App) GetCollection(id string) (*models.Collection, error) {
	return a.collectionRepository.GetByID(id)
}

func (a *App) UpdateCollection(collection *models.Collection) error {
	return a.collectionRepository.Update(collection.ID, collection.Name)
}

func (a *App) DeleteCollection(id string) error {
	return a.collectionRepository.Delete(id)
}

func (a *App) AddRequestToCollection(collectionID string, request *models.Request) error {
	return a.collectionRepository.AddRequest(collectionID, request)
}

// Environment methods
func (a *App) CreateEnvironment(name string) (*models.Environment, error) {
	return a.environmentRepository.Create(name)
}

func (a *App) GetEnvironments() ([]*models.Environment, error) {
	return a.environmentRepository.GetAll()
}

func (a *App) UpdateEnvironment(environment *models.Environment) error {
	return a.environmentRepository.Update(environment.ID, environment.Variables)
}

func (a *App) DeleteEnvironment(id string) error {
	return a.environmentRepository.Delete(id)
}

func (a *App) SetActiveEnvironment(id string) error {
	return a.environmentRepository.SetActive(id)
}

// History methods
func (a *App) GetHistory(limit, offset int) ([]*models.HistoryEntry, error) {
	return a.historyRepository.GetRecent(limit, offset)
}

func (a *App) ClearHistory() error {
	return a.historyRepository.Clear()
}

// Flow methods
func (a *App) CreateFlow(flow *models.Flow) (*models.Flow, error) {
	return a.flowRepository.Create(flow)
}

func (a *App) GetFlows() ([]*models.Flow, error) {
	return a.flowRepository.GetAll()
}

func (a *App) GetFlowsWithOptions(options db.FlowQueryOptions) ([]*models.Flow, error) {
	return a.flowRepository.GetAllWithOptions(options)
}

func (a *App) GetFlow(id string) (*models.Flow, error) {
	return a.flowRepository.GetByID(id)
}

func (a *App) UpdateFlow(flow *models.Flow) (*models.Flow, error) {
	return a.flowRepository.Update(flow)
}

func (a *App) DeleteFlow(id string) error {
	return a.flowRepository.Delete(id)
}

// SaveFlowToFile saves the flow as a JSON file in the flows directory next to the executable
func (a *App) SaveFlowToFile(flow *models.Flow) (string, error) {
	// Get the executable path
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("failed to get executable path: %w", err)
	}

	// Get the directory containing the executable
	exeDir := filepath.Dir(exePath)

	// Create flows directory if it doesn't exist
	flowsDir := filepath.Join(exeDir, "flows")
	if err := os.MkdirAll(flowsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create flows directory: %w", err)
	}

	// Create a safe filename from the flow name
	filename := flow.Name
	// Remove or replace invalid filename characters
	for _, r := range `<>:"/\|?*` {
		filename = filepath.FromSlash(string(r))
		if string(r) != "/" {
			filename = strings.ReplaceAll(flow.Name, string(r), "_")
		}
	}
	if filename == "" {
		filename = flow.ID
	}

	// Create the full file path
	filePath := filepath.Join(flowsDir, filename+".json")

	// Marshal the flow to JSON with pretty printing
	jsonData, err := json.MarshalIndent(flow, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal flow to JSON: %w", err)
	}

	// Write the file
	if err := os.WriteFile(filePath, jsonData, 0644); err != nil {
		return "", fmt.Errorf("failed to write flow file: %w", err)
	}

	return filePath, nil
}

// Config method
func (a *App) GetConfig() *Config {
	return a.config
}

// shutdown is called when the app closes
func (a *App) shutdown(ctx context.Context) {
	if a.database != nil {
		a.database.Close()
	}
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
