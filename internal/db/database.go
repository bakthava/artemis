package db

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/syndtr/goleveldb/leveldb"
)

// DB wraps a LevelDB database
type DB struct {
	conn *leveldb.DB
}

// New creates and initializes a LevelDB database
func New() (*DB, error) {
	// Create data directory
	dataDir := filepath.Join(os.Getenv("APPDATA"), "artemis")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	// Open LevelDB database
	dbPath := filepath.Join(dataDir, "artemis.db")
	conn, err := leveldb.OpenFile(dbPath, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db := &DB{conn: conn}

	// Initialize any required metadata
	if err := db.initMetadata(); err != nil {
		conn.Close()
		return nil, err
	}

	return db, nil
}

// initMetadata initializes default metadata entries
func (db *DB) initMetadata() error {
	// Ensure active environment key exists
	has, err := db.conn.Has([]byte("meta:active_env"), nil)
	if err != nil {
		return err
	}
	if !has {
		if err := db.conn.Put([]byte("meta:active_env"), []byte(""), nil); err != nil {
			return fmt.Errorf("failed to initialize metadata: %w", err)
		}
	}
	return nil
}

// Close closes the database connection
func (db *DB) Close() error {
	if db.conn != nil {
		return db.conn.Close()
	}
	return nil
}

// GetValue retrieves a value by key
func (db *DB) GetValue(key string) ([]byte, error) {
	return db.conn.Get([]byte(key), nil)
}

// SetValue stores a key-value pair
func (db *DB) SetValue(key string, value []byte) error {
	return db.conn.Put([]byte(key), value, nil)
}

// DeleteValue removes a key
func (db *DB) DeleteValue(key string) error {
	return db.conn.Delete([]byte(key), nil)
}

// GetJSON retrieves and deserializes JSON from a key
func (db *DB) GetJSON(key string, v interface{}) error {
	data, err := db.conn.Get([]byte(key), nil)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

// SetJSON serializes and stores JSON at a key
func (db *DB) SetJSON(key string, v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}
	return db.conn.Put([]byte(key), data, nil)
}

// KeyExists checks if a key exists
func (db *DB) KeyExists(key string) (bool, error) {
	return db.conn.Has([]byte(key), nil)
}

// GetActiveEnvironment retrieves the active environment ID
func (db *DB) GetActiveEnvironment() (string, error) {
	data, err := db.conn.Get([]byte("meta:active_env"), nil)
	if err != nil && err != leveldb.ErrNotFound {
		return "", err
	}
	return string(data), nil
}

// SetActiveEnvironment stores the active environment ID
func (db *DB) SetActiveEnvironment(id string) error {
	return db.conn.Put([]byte("meta:active_env"), []byte(id), nil)
}
