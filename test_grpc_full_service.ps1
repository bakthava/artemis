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

Write-Host "Testing gRPC with full service name (package.Service)" -ForegroundColor Cyan
Write-Host ""

try {
    $grpcReq = @{
        type = "GRPC"
        url = "localhost:50051"
        body = '{"name":"Artemis Flow Test"}'
        timeout = 30
        grpcConfig = @{
            service = "main.Greeter"
            method = "SayHello"
            messageFormat = "JSON"
            callType = "unary"
            metadata = @{
                "request-id" = "flow-test-001"
            }
            useTLS = $false
            protoContent = $protoContent
        }
    }

    Write-Host "Service: main.Greeter" -ForegroundColor Yellow
    Write-Host "Method: SayHello" -ForegroundColor Yellow
    Write-Host "Request: {`"name`":`"Artemis Flow Test`"}" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Sending request..." -ForegroundColor Cyan
    Write-Host ""

    $requestJson = $grpcReq | ConvertTo-Json -Depth 10

    $response = Invoke-WebRequest -Uri "$apiBase/request/execute" `
        -Method POST `
        -ContentType 'application/json' `
        -Body $requestJson `
        -UseBasicParsing `
        -ErrorAction Stop

    $result = $response.Content | ConvertFrom-Json

    Write-Host "========================================" -ForegroundColor Green
    Write-Host "gRPC TEST RESULT" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Status Code: $($result.statusCode)" -ForegroundColor $(if ($result.statusCode -eq 200) { "Green" } else { "Red" })
    Write-Host "Response Time: $($result.time) ms" -ForegroundColor Green       
    Write-Host "Protocol: $($result.protocol)" -ForegroundColor Green
    Write-Host ""

    if ($result.statusCode -eq 200) {
        Write-Host "Response Message:" -ForegroundColor Green
        Write-Host $result.body -ForegroundColor Green
        Write-Host ""
        Write-Host "[OK] gRPC UNARY CALL SUCCESSFUL!" -ForegroundColor Green     
    } else {
        Write-Host "Error:" -ForegroundColor Red
        Write-Host $result.body -ForegroundColor Red
    }

    Write-Host ""
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
