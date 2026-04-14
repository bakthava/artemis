package mock_grpc_server

import (
	"context"
	"fmt"
	"log"

	"google.golang.org/grpc"
)

// GreeterImpl implements the Greeter service
type GreeterImpl struct {
	UnimplementedGreeterServer
}

func (s *GreeterImpl) SayHello(ctx context.Context, in *HelloRequest) (*HelloReply, error) {
	log.Printf("SayHello: %v", in.GetName())
	return &HelloReply{Message: "Hello " + in.GetName() + "!"}, nil
}

func (s *GreeterImpl) SayHelloStream(in *HelloRequest, stream grpc.ServerStreamingServer[HelloReply]) error {
	log.Printf("SayHelloStream: %v", in.GetName())
	for i := 0; i < 3; i++ {
		err := stream.Send(&HelloReply{
			Message: fmt.Sprintf("Stream message %d for %s", i+1, in.GetName()),
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *GreeterImpl) ClientStreamHello(stream grpc.ClientStreamingServer[HelloRequest, HelloReply]) error {
	var count int
	var lastName string
	for {
		in, err := stream.Recv()
		if err != nil {
			return stream.SendAndClose(&HelloReply{
				Message: fmt.Sprintf("Received %d messages from %s", count, lastName),
			})
		}
		count++
		lastName = in.GetName()
		log.Printf("ClientStream recv: %v", in.GetName())
	}
}

func (s *GreeterImpl) BidirectionalStream(stream grpc.BidiStreamingServer[HelloRequest, HelloReply]) error {
	seq := 0
	for {
		in, err := stream.Recv()
		if err != nil {
			return nil
		}
		seq++
		log.Printf("Bidirectional recv: %v (seq: %d)", in.GetName(), seq)
		err = stream.Send(&HelloReply{
			Message: fmt.Sprintf("Echo %d: %s", seq, in.GetName()),
		})
		if err != nil {
			return err
		}
	}
}

// StreamerImpl implements the Streamer service
type StreamerImpl struct {
	UnimplementedStreamerServer
}

func (s *StreamerImpl) ListItems(in *ListRequest, stream grpc.ServerStreamingServer[Item]) error {
	log.Printf("ListItems: count=%d", in.GetCount())
	for i := 0; i < int(in.GetCount()); i++ {
		err := stream.Send(&Item{
			Id:   int32(i + 1),
			Name: fmt.Sprintf("Item-%d", i+1),
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// UploaderImpl implements the Uploader service
type UploaderImpl struct {
	UnimplementedUploaderServer
}

func (s *UploaderImpl) Upload(stream grpc.ClientStreamingServer[Chunk, UploadResponse]) error {
	var count int
	for {
		chunk, err := stream.Recv()
		if err != nil {
			return stream.SendAndClose(&UploadResponse{
				ChunksReceived: int32(count),
				Status:         "completed",
			})
		}
		count++
		log.Printf("Upload recv: %s", chunk.GetData())
	}
}

// EchoImpl implements the Echo service
type EchoImpl struct {
	UnimplementedEchoServer
}

func (s *EchoImpl) EchoBidirectional(stream grpc.BidiStreamingServer[EchoRequest, EchoResponse]) error {
	seq := 0
	for {
		req, err := stream.Recv()
		if err != nil {
			return nil
		}
		seq++
		log.Printf("Echo recv: %v (seq: %d)", req.GetText(), seq)
		err = stream.Send(&EchoResponse{
			Text:     req.GetText(),
			Sequence: int32(seq),
		})
		if err != nil {
			return err
		}
	}
}
