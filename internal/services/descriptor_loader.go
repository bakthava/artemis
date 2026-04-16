package services

import (
	"artemis/internal/models"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	descriptorpb "google.golang.org/protobuf/types/descriptorpb"
)

// DescriptorLoader handles loading and parsing proto file descriptors
type DescriptorLoader struct {
	mu              sync.RWMutex
	descriptorCache map[string]*descriptorpb.FileDescriptorProto
}

// NewDescriptorLoader creates a new descriptor loader
func NewDescriptorLoader() *DescriptorLoader {
	return &DescriptorLoader{
		descriptorCache: make(map[string]*descriptorpb.FileDescriptorProto),
	}
}

// LoadProtoFile loads a .proto file and extracts service definitions
func (dl *DescriptorLoader) LoadProtoFile(protoPath string) (*models.ProtoFile, error) {
	if protoPath == "" {
		return nil, fmt.Errorf("proto path cannot be empty")
	}

	// Check if file exists
	if _, err := os.Stat(protoPath); err != nil {
		return nil, fmt.Errorf("proto file not found: %s", protoPath)
	}

	// Read proto file content
	content, err := os.ReadFile(protoPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read proto file: %w", err)
	}

	// Parse proto file to extract service definitions
	protoFile, err := dl.parseProtoFile(protoPath, string(content))
	if err != nil {
		return nil, fmt.Errorf("failed to parse proto file: %w", err)
	}

	return protoFile, nil
}

// LoadProtoFilesFromDirectory scans a directory and loads all .proto files
func (dl *DescriptorLoader) LoadProtoFilesFromDirectory(dirPath string) ([]*models.ProtoFile, error) {
	if dirPath == "" {
		return []*models.ProtoFile{}, nil
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	var protoFiles []*models.ProtoFile
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".proto") {
			filePath := filepath.Join(dirPath, entry.Name())
			if protoFile, err := dl.LoadProtoFile(filePath); err == nil {
				protoFiles = append(protoFiles, protoFile)
			}
		}
	}

	return protoFiles, nil
}

// parseProtoFile parses a proto file and extracts service/method information
// Uses a simple parser that reads proto syntax directly (vs. running protoc for simplicity)
func (dl *DescriptorLoader) parseProtoFile(filePath, content string) (*models.ProtoFile, error) {
	protoFile := &models.ProtoFile{
		Name:     filepath.Base(filePath),
		Path:     filePath,
		Services: []models.ProtoService{},
	}

	lines := strings.Split(content, "\n")
	var currentService *models.ProtoService
	var inServiceBlock bool

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Skip comments and empty lines
		if strings.HasPrefix(line, "//") || line == "" {
			continue
		}

		// Extract package name
		if strings.HasPrefix(line, "package ") {
			pkg := strings.TrimPrefix(line, "package ")
			pkg = strings.TrimSuffix(pkg, ";")
			protoFile.PackageName = strings.TrimSpace(pkg)
			continue
		}

		// Detect service declaration
		if strings.HasPrefix(line, "service ") {
			serviceName := strings.TrimPrefix(line, "service ")
			serviceName = strings.TrimSpace(serviceName)
			serviceName = strings.TrimSuffix(serviceName, " {")
			currentService = &models.ProtoService{
				Name:    serviceName,
				Methods: []models.ProtoMethod{},
			}
			inServiceBlock = true
			continue
		}

		// Handle end of service block
		if inServiceBlock && line == "}" {
			if currentService != nil {
				protoFile.Services = append(protoFile.Services, *currentService)
			}
			currentService = nil
			inServiceBlock = false
			continue
		}

		// Parse RPC method definition
		if inServiceBlock && strings.HasPrefix(line, "rpc ") {
			method, err := dl.parseRPCMethod(line)
			if err == nil && method != nil && currentService != nil {
				currentService.Methods = append(currentService.Methods, *method)
			}
		}
	}

	// Handle case where service wasn't closed properly
	if currentService != nil && inServiceBlock {
		protoFile.Services = append(protoFile.Services, *currentService)
	}

	return protoFile, nil
}

// parseRPCMethod extracts method information from an RPC declaration
// Handles: rpc MethodName(InputType) returns (OutputType);
// Handles: rpc MethodName(stream InputType) returns (stream OutputType);
func (dl *DescriptorLoader) parseRPCMethod(line string) (*models.ProtoMethod, error) {
	// rpc MethodName(InputType) returns (OutputType);
	// or with streams: rpc MethodName(stream InputType) returns (stream OutputType);

	// Extract method name
	methodStart := strings.Index(line, "rpc ")
	if methodStart == -1 {
		return nil, fmt.Errorf("invalid RPC format")
	}

	line = strings.TrimPrefix(line, "rpc ")

	// Find method name and opening paren
	parenIdx := strings.Index(line, "(")
	if parenIdx == -1 {
		return nil, fmt.Errorf("invalid RPC format: missing opening paren")
	}

	methodName := strings.TrimSpace(line[:parenIdx])

	// Find matching closing paren for input
	closeIdx := strings.Index(line[parenIdx:], ")")
	if closeIdx == -1 {
		return nil, fmt.Errorf("invalid RPC format: missing closing paren")
	}

	inputPart := line[parenIdx+1 : parenIdx+closeIdx]
	inputType, isClientStream := extractType(inputPart)

	// Find returns
	returnsIdx := strings.Index(line, "returns ")
	if returnsIdx == -1 {
		return nil, fmt.Errorf("invalid RPC format: missing returns")
	}

	returnsStr := line[returnsIdx+len("returns"):]
	parenIdx = strings.Index(returnsStr, "(")
	if parenIdx == -1 {
		return nil, fmt.Errorf("invalid RPC format: missing opening paren in returns")
	}

	closeIdx = strings.Index(returnsStr[parenIdx:], ")")
	if closeIdx == -1 {
		return nil, fmt.Errorf("invalid RPC format: missing closing paren in returns")
	}

	outputPart := returnsStr[parenIdx+1 : parenIdx+closeIdx]
	outputType, isServerStream := extractType(outputPart)

	method := &models.ProtoMethod{
		Name:           methodName,
		InputType:      inputType,
		OutputType:     outputType,
		IsClientStream: isClientStream,
		IsServerStream: isServerStream,
	}

	return method, nil
}

// extractType parses a type string that may include "stream" keyword
// Returns (typeName, isStream)
func extractType(typeStr string) (string, bool) {
	typeStr = strings.TrimSpace(typeStr)
	isStream := strings.HasPrefix(typeStr, "stream ")
	if isStream {
		typeStr = strings.TrimPrefix(typeStr, "stream ")
	}
	return strings.TrimSpace(typeStr), isStream
}

// CompileProtoFile compiles a .proto file to a descriptor set
// Requires protoc to be installed on the system
func (dl *DescriptorLoader) CompileProtoFile(protoPath string) ([]byte, error) {
	// Check if protoc is available
	cmd := exec.Command("protoc", "--version")
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("protoc not found: please install protoc (https://grpc.io/docs/protoc-installation/)")
	}

	// Get directory and import paths
	protoDir := filepath.Dir(protoPath)
	tmpDescriptorFile := filepath.Join(os.TempDir(), "descriptor_"+strings.TrimSuffix(filepath.Base(protoPath), ".proto")+".pb")
	defer os.Remove(tmpDescriptorFile)

	// Compile proto file to descriptor set (include_imports ensures all dependencies
	// are embedded so protodesc.NewFiles can resolve the full type graph)
	cmd = exec.Command(
		"protoc",
		"--proto_path="+protoDir,
		"--include_imports",
		"--descriptor_set_out="+tmpDescriptorFile,
		protoPath,
	)

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("failed to compile proto file: %w", err)
	}

	// Read the generated descriptor file
	descriptorBytes, err := os.ReadFile(tmpDescriptorFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read descriptor file: %w", err)
	}

	return descriptorBytes, nil
}

// GetServices extracts all services from a proto file
func (dl *DescriptorLoader) GetServices(protoPath string) (map[string]models.ProtoService, error) {
	protoFile, err := dl.LoadProtoFile(protoPath)
	if err != nil {
		return nil, err
	}

	services := make(map[string]models.ProtoService)
	for _, svc := range protoFile.Services {
		fullName := svc.Name
		if protoFile.PackageName != "" {
			fullName = protoFile.PackageName + "." + svc.Name
		}
		services[fullName] = svc
	}

	return services, nil
}

// ClearCache clears the descriptor cache
func (dl *DescriptorLoader) ClearCache() {
	dl.mu.Lock()
	defer dl.mu.Unlock()
	dl.descriptorCache = make(map[string]*descriptorpb.FileDescriptorProto)
}

// ParseProtoContent parses .proto file content (without requiring protoc) and
// returns the services/methods defined in it. Suitable for service discovery UI.
func (dl *DescriptorLoader) ParseProtoContent(filename, content string) (*models.ProtoFile, error) {
	if filename == "" {
		filename = "proto"
	}
	return dl.parseProtoFile(filename, content)
}
