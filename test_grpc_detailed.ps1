$apiBase = "http://localhost:9090/api"

$protoContent = @"
syntax = "proto3";

package helloworld;

service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply) {}
}

message HelloRequest {
  string name = 1;
}

message HelloReply {
  string message = 1;
}
"@

Write-Host "Testing gRPC Plaintext Request with detailed output..." -ForegroundColor Cyan
Write-Host ""

try {
    $grpcReq = @{
        type = "GRPC"
        url = "localhost:50051"
        body = '{"name":"Artemis"}'
        timeout = 30
        grpcConfig = @{
            service = "helloworld.Greeter"
            method = "SayHello"
            messageFormat = "JSON"
            callType = "unary"
            metadata = @{}
            useTLS = $false
            protoContent = $protoContent
        }
    }
    
    Write-Host "Request Body:" -ForegroundColor Yellow
    $requestJson = $grpcReq | ConvertTo-Json -Depth 10
    Write-Host $requestJson -ForegroundColor Gray
    Write-Host ""
    
    $response = Invoke-WebRequest -Uri "$apiBase/request/execute" `
        -Method POST `
        -ContentType 'application/json' `
        -Body $requestJson `
        -UseBasicParsing `
        -ErrorAction Stop
    
    Write-Host "Response Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response Body:" -ForegroundColor Yellow
    $result = $response.Content | ConvertFrom-Json
    $result | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Gray
}
catch {
    Write-Host "Error occurred: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response) {
        Write-Host "Response Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
        
        try {
            $errorResponse = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($errorResponse)
            $errorContent = $reader.ReadToEnd()
            $reader.Close()
            
            Write-Host "Response Content:" -ForegroundColor Yellow
            Write-Host $errorContent -ForegroundColor Gray
            
            $errorJson = $errorContent | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($errorJson) {
                Write-Host ""
                Write-Host "Parsed Error:" -ForegroundColor Red
                $errorJson | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Gray
            }
        }
        catch {
            Write-Host "Could not parse error response: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}
