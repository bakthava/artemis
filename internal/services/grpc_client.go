package services

import (
	"artemis/internal/models"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

// GRPCClient handles gRPC request execution
type GRPCClient struct {
	descriptorLoader *DescriptorLoader
}

// NewGRPCClient creates a new gRPC client
func NewGRPCClient() *GRPCClient {
	return &GRPCClient{
		descriptorLoader: NewDescriptorLoader(),
	}
}

// methodDescriptors holds the input and output message descriptors for a gRPC method.
type methodDescriptors struct {
	input  protoreflect.MessageDescriptor
	output protoreflect.MessageDescriptor
}

// loadMethodDescriptors compiles the .proto file with protoc (--include_imports) and
// returns the input/output message descriptors for the named service method.
// Requires protoc to be installed and on PATH.
// If protoContent is non-empty the content is written to a temp file and used for compilation.
func (gc *GRPCClient) loadMethodDescriptors(protoPath, protoContent, serviceName, methodName string) (*methodDescriptors, error) {
	if protoContent != "" {
		// Write supplied content to a temp .proto file so protoc can compile it
		tmpFile, err := os.CreateTemp("", "artemis-*.proto")
		if err != nil {
			return nil, fmt.Errorf("failed to create temp proto file: %w", err)
		}
		defer os.Remove(tmpFile.Name())
		if _, err := tmpFile.WriteString(protoContent); err != nil {
			tmpFile.Close()
			return nil, fmt.Errorf("failed to write temp proto file: %w", err)
		}
		tmpFile.Close()
		protoPath = tmpFile.Name()
	}
	descriptorBytes, err := gc.descriptorLoader.CompileProtoFile(protoPath)
	if err != nil {
		return nil, err
	}

	var fds descriptorpb.FileDescriptorSet
	if err := proto.Unmarshal(descriptorBytes, &fds); err != nil {
		return nil, fmt.Errorf("failed to parse descriptor set: %w", err)
	}

	files, err := protodesc.NewFiles(&fds)
	if err != nil {
		return nil, fmt.Errorf("failed to build file registry: %w", err)
	}

	// Strip package prefix to get the short service name
	shortService := serviceName
	if idx := strings.LastIndex(serviceName, "."); idx >= 0 {
		shortService = serviceName[idx+1:]
	}

	var found *methodDescriptors
	files.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		svcDesc := fd.Services().ByName(protoreflect.Name(shortService))
		if svcDesc == nil {
			return true
		}
		mDesc := svcDesc.Methods().ByName(protoreflect.Name(methodName))
		if mDesc == nil {
			return true
		}
		found = &methodDescriptors{
			input:  mDesc.Input(),
			output: mDesc.Output(),
		}
		return false
	})

	if found == nil {
		return nil, fmt.Errorf("method %s/%s not found in proto file", serviceName, methodName)
	}
	return found, nil
}

// ExecuteRequest executes a gRPC request and returns the response
func (gc *GRPCClient) ExecuteRequest(request *models.Request) (*models.Response, error) {
	if request.GRPCConfig == nil {
		return nil, fmt.Errorf("gRPC configuration is required for gRPC requests")
	}

	startTime := time.Now()
	response := &models.Response{
		Timestamp: startTime.Unix(),
		Headers:   make(map[string]string),
		Logs:      []string{},
	}

	// Validate required fields
	if request.URL == "" {
		return errorResponse(response, "gRPC server address is required"), nil
	}
	if request.GRPCConfig.Service == "" {
		return errorResponse(response, "gRPC service name is required"), nil
	}
	if request.GRPCConfig.Method == "" {
		return errorResponse(response, "gRPC method name is required"), nil
	}

	// Establish TLS credentials
	tlsConfig, err := gc.buildTLSConfig(request)
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to build TLS config: %v", err)), nil
	}

	var creds credentials.TransportCredentials
	if tlsConfig != nil {
		creds = credentials.NewTLS(tlsConfig)
	} else {
		creds = insecure.NewCredentials()
	}

	// Create gRPC connection
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(request.Timeout)*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(ctx, request.URL, grpc.WithTransportCredentials(creds))
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to connect to gRPC server: %v", err)), nil
	}
	defer conn.Close()

	dialTime := time.Since(startTime).Milliseconds()
	response.ConnectionTime = dialTime

	// Execute based on call type
	callType := string(request.GRPCConfig.CallType)
	if callType == "" {
		callType = string(models.StreamingCallTypeUnary)
	}

	switch models.StreamingCallType(callType) {
	case models.StreamingCallTypeUnary:
		return gc.executeUnary(conn, request, response, startTime)
	case models.StreamingCallTypeServerStream:
		return gc.executeServerStreaming(conn, request, response, startTime)
	case models.StreamingCallTypeClientStream:
		return gc.executeClientStreaming(conn, request, response, startTime)
	case models.StreamingCallTypeBidirectionalStream:
		return gc.executeBidirectionalStreaming(conn, request, response, startTime)
	default:
		return errorResponse(response, fmt.Sprintf("unsupported call type: %s", callType)), nil
	}
}

// executeUnary executes a unary gRPC call
func (gc *GRPCClient) executeUnary(conn *grpc.ClientConn, request *models.Request, response *models.Response, startTime time.Time) (*models.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(request.Timeout)*time.Second)
	defer cancel()

	if request.GRPCConfig.Metadata != nil && len(request.GRPCConfig.Metadata) > 0 {
		md := metadata.New(request.GRPCConfig.Metadata)
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	if request.GRPCConfig.ProtoPath == "" && request.GRPCConfig.ProtoContent == "" {
		return errorResponse(response, "proto file path or uploaded content is required for gRPC execution"), nil
	}

	descs, err := gc.loadMethodDescriptors(request.GRPCConfig.ProtoPath, request.GRPCConfig.ProtoContent, request.GRPCConfig.Service, request.GRPCConfig.Method)
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to load proto descriptors: %v", err)), nil
	}

	reqMsg := dynamicpb.NewMessage(descs.input)
	body := strings.TrimSpace(request.Body)
	if body != "" && body != "{}" {
		if err := protojson.Unmarshal([]byte(body), reqMsg); err != nil {
			return errorResponse(response, fmt.Sprintf("failed to parse request body as JSON: %v", err)), nil
		}
	}

	rspMsg := dynamicpb.NewMessage(descs.output)
	fullMethodName := fmt.Sprintf("/%s/%s", request.GRPCConfig.Service, request.GRPCConfig.Method)

	var trailers metadata.MD
	err = conn.Invoke(ctx, fullMethodName, reqMsg, rspMsg, grpc.Trailer(&trailers))
	endTime := time.Since(startTime).Milliseconds()
	response.Time = endTime

	if err != nil {
		return errorResponse(response, fmt.Sprintf("gRPC call failed: %v", err)), nil
	}

	gc.extractMetadata(trailers, response)

	jsonBytes, jerr := protojson.Marshal(rspMsg)
	if jerr != nil {
		response.Body = fmt.Sprintf("%v", rspMsg)
	} else {
		response.Body = string(jsonBytes)
	}

	response.StatusCode = 200
	response.Protocol = "gRPC"
	response.ResponseTime = endTime

	return response, nil
}

// executeServerStreaming executes a server streaming gRPC call
func (gc *GRPCClient) executeServerStreaming(conn *grpc.ClientConn, request *models.Request, response *models.Response, startTime time.Time) (*models.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(request.Timeout)*time.Second)
	defer cancel()

	if request.GRPCConfig.Metadata != nil && len(request.GRPCConfig.Metadata) > 0 {
		md := metadata.New(request.GRPCConfig.Metadata)
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	if request.GRPCConfig.ProtoPath == "" && request.GRPCConfig.ProtoContent == "" {
		return errorResponse(response, "proto file path or uploaded content is required for gRPC execution"), nil
	}

	descs, err := gc.loadMethodDescriptors(request.GRPCConfig.ProtoPath, request.GRPCConfig.ProtoContent, request.GRPCConfig.Service, request.GRPCConfig.Method)
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to load proto descriptors: %v", err)), nil
	}

	reqMsg := dynamicpb.NewMessage(descs.input)
	body := strings.TrimSpace(request.Body)
	if body != "" && body != "{}" {
		if err := protojson.Unmarshal([]byte(body), reqMsg); err != nil {
			return errorResponse(response, fmt.Sprintf("failed to parse request body as JSON: %v", err)), nil
		}
	}

	fullMethodName := fmt.Sprintf("/%s/%s", request.GRPCConfig.Service, request.GRPCConfig.Method)

	stream, err := conn.NewStream(ctx, &grpc.StreamDesc{
		StreamName:    request.GRPCConfig.Method,
		ServerStreams: true,
	}, fullMethodName)
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to create stream: %v", err)), nil
	}

	if err := stream.SendMsg(reqMsg); err != nil {
		return errorResponse(response, fmt.Sprintf("failed to send message: %v", err)), nil
	}
	stream.CloseSend()

	var messages []json.RawMessage
	for {
		rspMsg := dynamicpb.NewMessage(descs.output)
		err := stream.RecvMsg(rspMsg)
		if err == io.EOF {
			break
		}
		if err != nil {
			return errorResponse(response, fmt.Sprintf("error receiving message: %v", err)), nil
		}
		jsonBytes, _ := protojson.Marshal(rspMsg)
		messages = append(messages, json.RawMessage(jsonBytes))
	}

	endTime := time.Since(startTime).Milliseconds()
	response.Time = endTime

	bodyBytes, _ := json.MarshalIndent(messages, "", "  ")
	response.Body = string(bodyBytes)
	response.StatusCode = 200
	response.Protocol = "gRPC"
	response.ResponseTime = endTime

	return response, nil
}

// executeClientStreaming executes a client streaming gRPC call
func (gc *GRPCClient) executeClientStreaming(conn *grpc.ClientConn, request *models.Request, response *models.Response, startTime time.Time) (*models.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(request.Timeout)*time.Second)
	defer cancel()

	if request.GRPCConfig.Metadata != nil && len(request.GRPCConfig.Metadata) > 0 {
		md := metadata.New(request.GRPCConfig.Metadata)
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	if request.GRPCConfig.ProtoPath == "" && request.GRPCConfig.ProtoContent == "" {
		return errorResponse(response, "proto file path or uploaded content is required for gRPC execution"), nil
	}

	descs, err := gc.loadMethodDescriptors(request.GRPCConfig.ProtoPath, request.GRPCConfig.ProtoContent, request.GRPCConfig.Service, request.GRPCConfig.Method)
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to load proto descriptors: %v", err)), nil
	}

	fullMethodName := fmt.Sprintf("/%s/%s", request.GRPCConfig.Service, request.GRPCConfig.Method)

	stream, err := conn.NewStream(ctx, &grpc.StreamDesc{
		StreamName:    request.GRPCConfig.Method,
		ClientStreams: true,
	}, fullMethodName)
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to create stream: %v", err)), nil
	}

	// Parse request body: JSON array of messages or a single message
	var rawMessages []json.RawMessage
	body := strings.TrimSpace(request.Body)
	if err := json.Unmarshal([]byte(body), &rawMessages); err != nil {
		rawMessages = []json.RawMessage{json.RawMessage(body)}
	}

	for _, raw := range rawMessages {
		msg := dynamicpb.NewMessage(descs.input)
		if err := protojson.Unmarshal([]byte(raw), msg); err != nil {
			return errorResponse(response, fmt.Sprintf("failed to parse message: %v", err)), nil
		}
		if err := stream.SendMsg(msg); err != nil {
			return errorResponse(response, fmt.Sprintf("failed to send message: %v", err)), nil
		}
	}
	stream.CloseSend()

	rspMsg := dynamicpb.NewMessage(descs.output)
	if err := stream.RecvMsg(rspMsg); err != nil && err != io.EOF {
		return errorResponse(response, fmt.Sprintf("failed to receive response: %v", err)), nil
	}

	endTime := time.Since(startTime).Milliseconds()
	response.Time = endTime

	jsonBytes, _ := protojson.Marshal(rspMsg)
	response.Body = string(jsonBytes)
	response.StatusCode = 200
	response.Protocol = "gRPC"
	response.ResponseTime = endTime

	return response, nil
}

// executeBidirectionalStreaming executes a bidirectional streaming gRPC call
func (gc *GRPCClient) executeBidirectionalStreaming(conn *grpc.ClientConn, request *models.Request, response *models.Response, startTime time.Time) (*models.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(request.Timeout)*time.Second)
	defer cancel()

	if request.GRPCConfig.Metadata != nil && len(request.GRPCConfig.Metadata) > 0 {
		md := metadata.New(request.GRPCConfig.Metadata)
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	if request.GRPCConfig.ProtoPath == "" && request.GRPCConfig.ProtoContent == "" {
		return errorResponse(response, "proto file path or uploaded content is required for gRPC execution"), nil
	}

	descs, err := gc.loadMethodDescriptors(request.GRPCConfig.ProtoPath, request.GRPCConfig.ProtoContent, request.GRPCConfig.Service, request.GRPCConfig.Method)
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to load proto descriptors: %v", err)), nil
	}

	fullMethodName := fmt.Sprintf("/%s/%s", request.GRPCConfig.Service, request.GRPCConfig.Method)

	stream, err := conn.NewStream(ctx, &grpc.StreamDesc{
		StreamName:    request.GRPCConfig.Method,
		ClientStreams: true,
		ServerStreams: true,
	}, fullMethodName)
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to create stream: %v", err)), nil
	}

	// Parse request body: JSON array or single message
	var rawMessages []json.RawMessage
	body := strings.TrimSpace(request.Body)
	if err := json.Unmarshal([]byte(body), &rawMessages); err != nil {
		rawMessages = []json.RawMessage{json.RawMessage(body)}
	}

	go func() {
		for _, raw := range rawMessages {
			msg := dynamicpb.NewMessage(descs.input)
			if err := protojson.Unmarshal([]byte(raw), msg); err == nil {
				stream.SendMsg(msg)
			}
		}
		stream.CloseSend()
	}()

	var responses []json.RawMessage
	for {
		rspMsg := dynamicpb.NewMessage(descs.output)
		err := stream.RecvMsg(rspMsg)
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
		jsonBytes, _ := protojson.Marshal(rspMsg)
		responses = append(responses, json.RawMessage(jsonBytes))
	}

	endTime := time.Since(startTime).Milliseconds()
	response.Time = endTime

	bodyBytes, _ := json.MarshalIndent(responses, "", "  ")
	response.Body = string(bodyBytes)
	response.StatusCode = 200
	response.Protocol = "gRPC"
	response.ResponseTime = endTime

	return response, nil
}

// buildTLSConfig builds TLS configuration for gRPC connection.
// Returns nil when UseTLS is false and no cert files are configured (insecure/plaintext connection).
func (gc *GRPCClient) buildTLSConfig(request *models.Request) (*tls.Config, error) {
	if request.GRPCConfig == nil {
		return nil, nil
	}

	// Use plaintext (insecure) when TLS is not explicitly enabled and no cert files are provided
	hasCerts := request.GRPCConfig.CertificateFile != "" || request.GRPCConfig.CACertFile != ""
	if !request.GRPCConfig.UseTLS && !hasCerts {
		return nil, nil
	}

	tlsConfig := &tls.Config{
		InsecureSkipVerify: !request.VerifySSL,
	}

	// Load client certificates for mTLS
	if request.GRPCConfig.CertificateFile != "" && request.GRPCConfig.KeyFile != "" {
		certPEM, err := os.ReadFile(request.GRPCConfig.CertificateFile)
		if err != nil {
			return nil, fmt.Errorf("failed to read certificate file: %w", err)
		}

		keyPEM, err := os.ReadFile(request.GRPCConfig.KeyFile)
		if err != nil {
			return nil, fmt.Errorf("failed to read key file: %w", err)
		}

		cert, err := tls.X509KeyPair(certPEM, keyPEM)
		if err != nil {
			return nil, fmt.Errorf("failed to parse certificate pair: %w", err)
		}

		tlsConfig.Certificates = []tls.Certificate{cert}
	}

	// Load CA certificate
	if request.GRPCConfig.CACertFile != "" {
		caCertPEM, err := os.ReadFile(request.GRPCConfig.CACertFile)
		if err != nil {
			return nil, fmt.Errorf("failed to read CA certificate file: %w", err)
		}

		caCertPool := x509.NewCertPool()
		if !caCertPool.AppendCertsFromPEM(caCertPEM) {
			return nil, fmt.Errorf("failed to parse CA certificates")
		}

		tlsConfig.RootCAs = caCertPool
	}

	return tlsConfig, nil
}

// extractMetadata extracts gRPC metadata and adds to response headers
func (gc *GRPCClient) extractMetadata(md metadata.MD, response *models.Response) {
	for key, values := range md {
		if len(values) > 0 {
			// Prefix with "grpc-" to distinguish from HTTP headers
			response.Headers["grpc-"+key] = strings.Join(values, ", ")
		}
	}
}

// errorResponse creates an error response
func errorResponse(response *models.Response, errMsg string) *models.Response {
	response.StatusCode = 500
	response.Body = errMsg
	response.Protocol = "gRPC"
	response.Time = time.Since(time.Unix(response.Timestamp, 0)).Milliseconds()
	return response
}

// MarshalMessage converts a message to JSON or hex binary format
func (gc *GRPCClient) MarshalMessage(msg proto.Message, format string) (string, error) {
	if format == "BINARY" {
		bytes, err := proto.Marshal(msg)
		if err != nil {
			return "", err
		}
		return hex.EncodeToString(bytes), nil
	}

	// Default to JSON
	bytes, err := protojson.Marshal(msg)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// UnmarshalMessage converts JSON or hex binary to a message
func (gc *GRPCClient) UnmarshalMessage(data string, format string, msg proto.Message) error {
	if format == "BINARY" {
		bytes, err := hex.DecodeString(data)
		if err != nil {
			return err
		}
		return proto.Unmarshal(bytes, msg)
	}

	// Default to JSON
	return protojson.Unmarshal([]byte(data), msg)
}
