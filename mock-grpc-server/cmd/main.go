package main

import (
	"log"
	"net"

	"google.golang.org/grpc"
	s "artemis/mock-grpc-server"
)

func main() {
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}
	grpcServer := grpc.NewServer()

	// Register services
	s.RegisterGreeterServer(grpcServer, &s.GreeterImpl{})
	s.RegisterStreamerServer(grpcServer, &s.StreamerImpl{})
	s.RegisterUploaderServer(grpcServer, &s.UploaderImpl{})
	s.RegisterEchoServer(grpcServer, &s.EchoImpl{})

	log.Printf("gRPC mock server listening at %v", lis.Addr())
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
