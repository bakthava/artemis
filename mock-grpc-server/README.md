# gRPC Mock Server for Testing

This directory contains a gRPC mock server used for testing Artemis gRPC functionality.

## Setup & Run

### Prerequisites
- Go 1.23+
- protoc (Protocol Buffers compiler)

### Generate Proto Files

```bash
cd mock-grpc-server

# Install protobuf compiler (Windows)
# Using scoop:
scoop install protobuf

# Or download from: https://github.com/protocolbuffers/protobuf/releases
```

### Generate Go Code from Proto Files

```bash
# Generate helloworld service
protoc --go_out=. --go_opt=paths=source_relative \
        --go-grpc_out=. --go-grpc_opt=paths=source_relative \
        helloworld.proto

# Generate streaming services
protoc --go_out=. --go_opt=paths=source_relative \
        --go-grpc_out=. --go-grpc_opt=paths=source_relative \
        streaming.proto
```

### Run the Mock Server

```bash
cd mock-grpc-server

# Download dependencies
go mod download

# Run the server
go run main.go
```

Server will listen on `localhost:50051`

## Services Available

### Greeter Service (helloworld)
- **SayHello** (Unary): Single request/response
- **SayHelloStream** (Server Streaming): Single request, multiple responses
- **ClientStreamHello** (Client Streaming): Multiple requests, single response
- **BidirectionalStream** (Bidirectional): Multiple messages in both directions

### Streamer Service (streaming)
- **ListItems** (Server Streaming): Stream items with count parameter

### Uploader Service (streaming)
- **Upload** (Client Streaming): Upload chunks, receive confirmation

### Echo Service (streaming)
- **EchoBidirectional** (Bidirectional): Echo messages with sequence number

## Testing with Artemis

1. Start the mock server: `go run main.go`
2. In Artemis, create new gRPC requests targeting `localhost:50051`
3. Use proto files from this directory
4. Follow test scenarios in TESTING.md (Tests 14-25)

## Troubleshooting

**Port already in use**: Change port in main.go (currently :50051)

**Proto files not found**: Ensure full path to proto files or use relative path from Artemis app

**Service/method not recognized**: Run proto generation commands again, ensure generated files exist
