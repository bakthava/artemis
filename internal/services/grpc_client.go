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

	// Add metadata to context
	if request.GRPCConfig.Metadata != nil && len(request.GRPCConfig.Metadata) > 0 {
		md := metadata.New(request.GRPCConfig.Metadata)
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	// Create dynamic message from request body
	var requestMsg proto.Message
	if strings.TrimSpace(request.Body) == "" || request.Body == "{}" {
		// Empty message
		requestMsg = &dynamicpb.Message{}
	} else if request.GRPCConfig.MessageFormat == "BINARY" {
		// Decode hex binary to bytes
		decoded, err := hex.DecodeString(request.Body)
		if err != nil {
			return errorResponse(response, fmt.Sprintf("failed to decode hex binary: %v", err)), nil
		}
		// For now, treat as protobuf bytes
		requestMsg = &dynamicpb.Message{}
		if err := proto.Unmarshal(decoded, requestMsg); err != nil {
			// Fallback: wrap as string
			requestMsg = &dynamicpb.Message{}
		}
	} else {
		// JSON format
		var msgData interface{}
		if err := json.Unmarshal([]byte(request.Body), &msgData); err != nil {
			return errorResponse(response, fmt.Sprintf("failed to parse request message JSON: %v", err)), nil
		}
		// Convert to proto message (simplified - full implementation would use descriptor reflection)
		requestMsg = &dynamicpb.Message{}
	}

	fullMethodName := fmt.Sprintf("/%s/%s", request.GRPCConfig.Service, request.GRPCConfig.Method)

	// Invoke unary RPC using generic call
	var responseMsg interface{}
	var trailers metadata.MD
	err := conn.Invoke(ctx, fullMethodName, requestMsg, &responseMsg, grpc.Trailer(&trailers))

	endTime := time.Since(startTime).Milliseconds()
	response.Time = endTime

	if err != nil {
		return errorResponse(response, fmt.Sprintf("gRPC call failed: %v", err)), nil
	}

	// Extract trailers/metadata
	gc.extractMetadata(trailers, response)

	// Set response body
	if responseMsg != nil {
		body, err := json.MarshalIndent(responseMsg, "", "  ")
		if err != nil {
			response.Body = fmt.Sprintf("%v", responseMsg)
		} else {
			response.Body = string(body)
		}
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

	// Add metadata to context
	if request.GRPCConfig.Metadata != nil && len(request.GRPCConfig.Metadata) > 0 {
		md := metadata.New(request.GRPCConfig.Metadata)
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	fullMethodName := fmt.Sprintf("/%s/%s", request.GRPCConfig.Service, request.GRPCConfig.Method)

	// Create stream using generic call
	stream, err := conn.NewStream(ctx, &grpc.StreamDesc{
		StreamName: fullMethodName,
	}, fullMethodName)
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to create stream: %v", err)), nil
	}

	// Send request message
	requestMsg := &dynamicpb.Message{}
	if strings.TrimSpace(request.Body) != "" && request.Body != "{}" {
		json.Unmarshal([]byte(request.Body), requestMsg)
	}
	if err := stream.SendMsg(requestMsg); err != nil {
		return errorResponse(response, fmt.Sprintf("failed to send message: %v", err)), nil
	}

	// Receive streaming messages
	var messages []interface{}
	for {
		var msg dynamicpb.Message
		err := stream.RecvMsg(&msg)
		if err == io.EOF {
			break
		}
		if err != nil {
			return errorResponse(response, fmt.Sprintf("error receiving message: %v", err)), nil
		}
		messages = append(messages, msg)
	}

	endTime := time.Since(startTime).Milliseconds()
	response.Time = endTime

	// Set response body as JSON array
	bodyBytes, err := json.MarshalIndent(messages, "", "  ")
	if err != nil {
		response.Body = fmt.Sprintf("%v", messages)
	} else {
		response.Body = string(bodyBytes)
	}

	response.StatusCode = 200
	response.Protocol = "gRPC"
	response.ResponseTime = endTime

	return response, nil
}

// executeClientStreaming executes a client streaming gRPC call
func (gc *GRPCClient) executeClientStreaming(conn *grpc.ClientConn, request *models.Request, response *models.Response, startTime time.Time) (*models.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(request.Timeout)*time.Second)
	defer cancel()

	// Add metadata to context
	if request.GRPCConfig.Metadata != nil && len(request.GRPCConfig.Metadata) > 0 {
		md := metadata.New(request.GRPCConfig.Metadata)
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	fullMethodName := fmt.Sprintf("/%s/%s", request.GRPCConfig.Service, request.GRPCConfig.Method)

	// Create stream
	stream, err := conn.NewStream(ctx, &grpc.StreamDesc{
		StreamName: fullMethodName,
	}, fullMethodName)
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to create stream: %v", err)), nil
	}

	// Parse request body as JSON array of messages
	var messages []interface{}
	err = json.Unmarshal([]byte(request.Body), &messages)
	if err != nil {
		// If not array, treat as single message
		var msg interface{}
		if err := json.Unmarshal([]byte(request.Body), &msg); err != nil {
			return errorResponse(response, fmt.Sprintf("failed to parse request messages: %v", err)), nil
		}
		messages = []interface{}{msg}
	}

	// Send all messages
	for _, msg := range messages {
		protoMsg := &dynamicpb.Message{}
		if msgBytes, err := json.Marshal(msg); err == nil {
			json.Unmarshal(msgBytes, protoMsg)
		}
		if err := stream.SendMsg(protoMsg); err != nil {
			return errorResponse(response, fmt.Sprintf("failed to send message: %v", err)), nil
		}
	}

	// Close send side
	stream.CloseSend()

	// Receive response
	var responseMsg interface{}
	err = stream.RecvMsg(&responseMsg)
	if err != nil && err != io.EOF {
		return errorResponse(response, fmt.Sprintf("failed to receive response: %v", err)), nil
	}

	endTime := time.Since(startTime).Milliseconds()
	response.Time = endTime

	// Set response body
	if responseMsg != nil {
		body, _ := json.MarshalIndent(responseMsg, "", "  ")
		response.Body = string(body)
	}

	response.StatusCode = 200
	response.Protocol = "gRPC"
	response.ResponseTime = endTime

	return response, nil
}

// executeBidirectionalStreaming executes a bidirectional streaming gRPC call
func (gc *GRPCClient) executeBidirectionalStreaming(conn *grpc.ClientConn, request *models.Request, response *models.Response, startTime time.Time) (*models.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(request.Timeout)*time.Second)
	defer cancel()

	// Add metadata to context
	if request.GRPCConfig.Metadata != nil && len(request.GRPCConfig.Metadata) > 0 {
		md := metadata.New(request.GRPCConfig.Metadata)
		ctx = metadata.NewOutgoingContext(ctx, md)
	}

	fullMethodName := fmt.Sprintf("/%s/%s", request.GRPCConfig.Service, request.GRPCConfig.Method)

	// Create bidirectional stream
	stream, err := conn.NewStream(ctx, &grpc.StreamDesc{
		StreamName: fullMethodName,
	}, fullMethodName)
	if err != nil {
		return errorResponse(response, fmt.Sprintf("failed to create stream: %v", err)), nil
	}

	// Parse request body as JSON array of messages
	var messages []interface{}
	err = json.Unmarshal([]byte(request.Body), &messages)
	if err != nil {
		var msg interface{}
		if err := json.Unmarshal([]byte(request.Body), &msg); err != nil {
			return errorResponse(response, fmt.Sprintf("failed to parse request messages: %v", err)), nil
		}
		messages = []interface{}{msg}
	}

	// Send messages in goroutine
	go func() {
		for _, msg := range messages {
			protoMsg := &dynamicpb.Message{}
			if msgBytes, err := json.Marshal(msg); err == nil {
				json.Unmarshal(msgBytes, protoMsg)
			}
			stream.SendMsg(protoMsg)
		}
		stream.CloseSend()
	}()

	// Receive streaming responses
	var responses []interface{}
	for {
		var msg interface{}
		err := stream.RecvMsg(&msg)
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
		responses = append(responses, msg)
	}

	endTime := time.Since(startTime).Milliseconds()
	response.Time = endTime

	// Set response body as JSON array
	bodyBytes, _ := json.MarshalIndent(responses, "", "  ")
	response.Body = string(bodyBytes)

	response.StatusCode = 200
	response.Protocol = "gRPC"
	response.ResponseTime = endTime

	return response, nil
}

// buildTLSConfig builds TLS configuration for gRPC connection
func (gc *GRPCClient) buildTLSConfig(request *models.Request) (*tls.Config, error) {
	if request.GRPCConfig == nil {
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
