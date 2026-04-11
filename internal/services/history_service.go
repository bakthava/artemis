package services

import (
	"encoding/json"
	"artemis/internal/models"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/google/uuid"
)

// HistoryService manages request history
type HistoryService struct {
	dataDir string
	maxSize int
}

// NewHistoryService creates a new history service
func NewHistoryService(dataDir string) *HistoryService {
	return &HistoryService{
		dataDir: dataDir,
		maxSize: 100, // Keep last 100 requests
	}
}

// AddToHistory adds a request/response to history
func (hs *HistoryService) AddToHistory(request *models.Request, response *models.Response) error {
	entry := &models.HistoryEntry{
		ID:        uuid.New().String(),
		Request:   request,
		Response:  response,
		Timestamp: time.Now().Unix(),
	}

	history, err := hs.GetHistory()
	if err != nil {
		history = []*models.HistoryEntry{}
	}

	history = append(history, entry)

	// Keep only the last maxSize entries
	if len(history) > hs.maxSize {
		history = history[len(history)-hs.maxSize:]
	}

	return hs.saveHistory(history)
}

// GetHistory returns all history entries
func (hs *HistoryService) GetHistory() ([]*models.HistoryEntry, error) {
	path := filepath.Join(hs.dataDir, "history.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []*models.HistoryEntry{}, nil
		}
		return nil, err
	}
	var history []*models.HistoryEntry
	if err := json.Unmarshal(data, &history); err != nil {
		return nil, err
	}
	// Sort by timestamp descending (newest first)
	sort.Slice(history, func(i, j int) bool {
		return history[i].Timestamp > history[j].Timestamp
	})
	return history, nil
}

// ClearHistory clears all history
func (hs *HistoryService) ClearHistory() error {
	path := filepath.Join(hs.dataDir, "history.json")
	return os.Remove(path)
}

// saveHistory saves history to disk
func (hs *HistoryService) saveHistory(history []*models.HistoryEntry) error {
	if err := os.MkdirAll(hs.dataDir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(history, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(hs.dataDir, "history.json")
	return os.WriteFile(path, data, 0644)
}
