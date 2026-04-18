$apiBase = "http://localhost:9090/api"

$protoContent = @"
syntax = "proto3";

package main;

service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply) {}
  rpc SayHelloStream (HelloRequest) returns (stream HelloReply) {}
  rpc ClientStreamHello (stream HelloRequest) returns (HelloReply) {}
  rpc BidirectionalStream (stream HelloRequest) returns (stream HelloReply) {}
}

message HelloRequest {
  string name = 1;
}

message HelloReply {
  string message = 1;
}
"@

Write-Host "Testing gRPC Plaintext Request - CORRECTED" -ForegroundColor Cyan
Write-Host ""

try {
    $grpcReq = @{
        type = "GRPC"
        url = "localhost:50051"
        body = '{"name":"Artemis"}'
        timeout = 30
        grpcConfig = @{
            service = "Greeter"
            method = "SayHello"
            messageFormat = "JSON"
            callType = "unary"
            metadata = @{}
            useTLS = $false
            protoContent = $protoContent
        }
    }
    
    Write-Host "Sending gRPC request to localhost:50051..." -ForegroundColor Yellow
    $requestJson = $grpcReq | ConvertTo-Json -Depth 10
    
    $response = Invoke-WebRequest -Uri "$apiBase/request/execute" `
        -Method POST `
        -ContentType 'application/json' `
        -Body $requestJson `
        -UseBasicParsing `
        -ErrorAction Stop
    
    $result = $response.Content | ConvertFrom-Json
    
    Write-Host ""
    Write-Host "Response Status Code: $($result.statusCode)" -ForegroundColor Green
    Write-Host "Response Time: $($result.time) ms" -ForegroundColor Green
    
    if ($result.statusCode -eq 200) {
        Write-Host "Response Body: $($result.body)" -ForegroundColor Green
        Write-Host ""
        Write-Host "SUCCESS! gRPC request completed." -ForegroundColor Green
    } else {
        Write-Host "Error: $($result.body)" -ForegroundColor Red
    }
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
