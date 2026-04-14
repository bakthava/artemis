package models

import "time"

// ProtoMethod represents a gRPC method definition
type ProtoMethod struct {
	Name             string `json:"name"`             // Method name (e.g., "SayHello")
	InputType        string `json:"inputType"`        // Input message type (e.g., "HelloRequest")
	OutputType       string `json:"outputType"`       // Output message type (e.g., "HelloReply")
	IsServerStream   bool   `json:"isServerStream"`   // True if server sends stream of messages
	IsClientStream   bool   `json:"isClientStream"`   // True if client sends stream of messages
}

// ProtoService represents a gRPC service definition
type ProtoService struct {
	Name    string          `json:"name"`    // Service name (e.g., "Greeter")
	Methods []ProtoMethod   `json:"methods"` // Available methods in service
}

// ProtoFile represents a parsed .proto definition file
type ProtoFile struct {
	Name        string          `json:"name"`        // File name (e.g., "helloworld.proto")
	Path        string          `json:"path"`        // Full file path
	PackageName string          `json:"packageName"` // Proto package name
	Services    []ProtoService  `json:"services"`    // Services defined in this proto
	ImportedAt  time.Time       `json:"importedAt"`  // Timestamp when proto was imported
}

// GRPCMessageContent represents a gRPC message payload
type GRPCMessageContent struct {
	Format  string `json:"format"`  // "JSON" or "BINARY"
	Content string `json:"content"` // JSON string or hex-encoded binary
}

// GRPCRequestMessage represents a complete gRPC request message
type GRPCRequestMessage struct {
	Format    string            `json:"format"`    // "JSON" or "BINARY"
	Content   string            `json:"content"`   // Message content
	Metadata  map[string]string `json:"metadata"`  // gRPC metadata headers
}

// GRPCStreamMessage represents a single message in a streaming response
type GRPCStreamMessage struct {
	Index     int    `json:"index"`     // Message index in stream
	Format    string `json:"format"`    // "JSON" or "BINARY"
	Content   string `json:"content"`   // Message content
	Timestamp int64  `json:"timestamp"` // Timestamp when message was received
}
