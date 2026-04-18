#!/usr/bin/env powershell
# Comprehensive Artemis Flow Test Suite
# Tests: HTTP, HTTPS, gRPC (plaintext and streaming)
# Mixed protocol flows

$apiBase = "http://localhost:9090/api"
$testResults = @()

function Test-Request {
    param(
        [string]$TestName,
        [hashtable]$Request,
        [scriptblock]$Validator
    )
    
    try {
        Write-Host "  Testing: $TestName" -ForegroundColor Cyan
        
        $response = Invoke-WebRequest -Uri "$apiBase/request/execute" `
            -Method POST `
            -ContentType 'application/json' `
            -Body ($Request | ConvertTo-Json -Depth 10) `
            -UseBasicParsing `
            -ErrorAction Stop
        
        $result = $response.Content | ConvertFrom-Json
        
        # Run validator if provided
        if ($Validator) {
            $isValid = & $Validator $result
        } else {
            $isValid = $result.statusCode -eq 200
        }
        
        if ($isValid) {
            Write-Host "    [PASS] Status: $($result.statusCode), Time: $($result.time)ms" -ForegroundColor Green
            $testResults += @{
                Name = $TestName
                Status = "PASS"
                StatusCode = $result.statusCode
                Time = $result.time
            }
            return $true
        } else {
            Write-Host "    [FAIL] Validation failed" -ForegroundColor Red
            $testResults += @{
                Name = $TestName
                Status = "FAIL"
                Error = "Validation failed"
            }
            return $false
        }
    }
    catch {
        Write-Host "    [ERROR] $($_.Exception.Message)" -ForegroundColor Red
        $testResults += @{
            Name = $TestName
            Status = "ERROR"
            Error = $_.Exception.Message
        }
        return $false
    }
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "ARTEMIS MIXED PROTOCOL FLOW TEST SUITE" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Proto content for gRPC tests
$protoContent = @"
syntax = "proto3";

package main;

service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply) {}
  rpc SayHelloStream (HelloRequest) returns (stream HelloReply) {}
  rpc ClientStreamHello (stream HelloRequest) returns (HelloReply) {}
  rpc BidirectionalStream (stream HelloRequest) returns (stream HelloReply) {}
}

service Streamer {
  rpc ListItems (ListRequest) returns (stream Item) {}
}

message HelloRequest {
  string name = 1;
}

message HelloReply {
  string message = 1;
}

message ListRequest {
  int32 count = 1;
}

message Item {
  int32 id = 1;
  string name = 2;
}
"@

# ==== TEST CATEGORY: HTTP REQUESTS ====
Write-Host "CATEGORY 1: HTTP Requests" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Yellow

# Test 1.1: HTTP GET
Test-Request -TestName "HTTP GET (httpbin.org)" `
    -Request @{
        type = "HTTP"
        method = "GET"
        url = "https://httpbin.org/get"
        headers = @{}
        params = @{}
        body = ""
        timeout = 30
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

# Test 1.2: HTTP POST with JSON body
Test-Request -TestName "HTTP POST with JSON (httpbin.org)" `
    -Request @{
        type = "HTTP"
        method = "POST"
        url = "https://httpbin.org/post"
        headers = @{ "Content-Type" = "application/json" }
        params = @{}
        body = '{"test":"artemis","flow":"execution"}'
        timeout = 30
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

# Test 1.3: HTTP PUT
Test-Request -TestName "HTTP PUT (httpbin.org)" `
    -Request @{
        type = "HTTP"
        method = "PUT"
        url = "https://httpbin.org/put"
        headers = @{ "Content-Type" = "application/json" }
        params = @{}
        body = '{"id":1,"name":"test"}'
        timeout = 30
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

# Test 1.4: HTTP DELETE
Test-Request -TestName "HTTP DELETE (httpbin.org)" `
    -Request @{
        type = "HTTP"
        method = "DELETE"
        url = "https://httpbin.org/delete"
        headers = @{}
        params = @{}
        body = ""
        timeout = 30
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

# Test 1.5: HTTP with query parameters
Test-Request -TestName "HTTP GET with Query Parameters" `
    -Request @{
        type = "HTTP"
        method = "GET"
        url = "https://httpbin.org/get"
        headers = @{}
        params = @{ "key" = "value"; "flow" = "artemis" }
        body = ""
        timeout = 30
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

# Test 1.6: HTTP with custom headers
Test-Request -TestName "HTTP with Custom Headers" `
    -Request @{
        type = "HTTP"
        method = "GET"
        url = "https://httpbin.org/headers"
        headers = @{
            "X-Test-Header" = "Artemis"
            "X-Flow-Name" = "TestFlow"
        }
        params = @{}
        body = ""
        timeout = 30
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

# Test 1.7: HTTP PATCH
Test-Request -TestName "HTTP PATCH (httpbin.org)" `
    -Request @{
        type = "HTTP"
        method = "PATCH"
        url = "https://httpbin.org/patch"
        headers = @{ "Content-Type" = "application/json" }
        params = @{}
        body = '{"update":"value"}'
        timeout = 30
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

# Test 1.8: HTTP HEAD
Test-Request -TestName "HTTP HEAD (httpbin.org)" `
    -Request @{
        type = "HTTP"
        method = "HEAD"
        url = "https://httpbin.org/get"
        headers = @{}
        params = @{}
        body = ""
        timeout = 30
    } `
    -Validator { param($r) $r.statusCode -eq 200 -or $r.statusCode -eq 204 }

# Test 1.9: HTTP OPTIONS
Test-Request -TestName "HTTP OPTIONS (httpbin.org)" `
    -Request @{
        type = "HTTP"
        method = "OPTIONS"
        url = "https://httpbin.org/anything"
        headers = @{}
        params = @{}
        body = ""
        timeout = 30
    } `
    -Validator { param($r) $r.statusCode -eq 200 -or $r.statusCode -eq 204 }

# Test 1.10: HTTP with XML body
Test-Request -TestName "HTTP POST with XML (httpbin.org)" `
    -Request @{
        type = "HTTP"
        method = "POST"
        url = "https://httpbin.org/post"
        headers = @{ "Content-Type" = "application/xml" }
        params = @{}
        body = '<root><test>artemis</test></root>'
        timeout = 30
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

Write-Host ""

# ==== TEST CATEGORY: gRPC UNARY REQUESTS ====
Write-Host "CATEGORY 2: gRPC Unary Calls" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Yellow

# Test 2.1: gRPC Unary Call - Basic
Test-Request -TestName "gRPC Unary: SayHello (plaintext)" `
    -Request @{
        type = "GRPC"
        url = "localhost:50051"
        body = '{"name":"Artemis"}'
        timeout = 30
        grpcConfig = @{
            service = "main.Greeter"
            method = "SayHello"
            messageFormat = "JSON"
            callType = "unary"
            metadata = @{}
            useTLS = $false
            protoContent = $protoContent
        }
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

# Test 2.2: gRPC Unary with metadata
Test-Request -TestName "gRPC Unary with Metadata" `
    -Request @{
        type = "GRPC"
        url = "localhost:50051"
        body = '{"name":"TestFlow"}'
        timeout = 30
        grpcConfig = @{
            service = "main.Greeter"
            method = "SayHello"
            messageFormat = "JSON"
            callType = "unary"
            metadata = @{
                "test-id" = "flow-001"
                "request-type" = "test"
            }
            useTLS = $false
            protoContent = $protoContent
        }
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

# Test 2.3: gRPC Unary with complex request
Test-Request -TestName "gRPC Unary: Complex Request" `
    -Request @{
        type = "GRPC"
        url = "localhost:50051"
        body = '{"name":"ComplexTest-WithSpecialChars-123"}'
        timeout = 30
        grpcConfig = @{
            service = "main.Greeter"
            method = "SayHello"
            messageFormat = "JSON"
            callType = "unary"
            metadata = @{}
            useTLS = $false
            protoContent = $protoContent
        }
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

Write-Host ""

# ==== TEST CATEGORY: gRPC STREAMING REQUESTS ====
Write-Host "CATEGORY 3: gRPC Streaming Calls" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Yellow

# Test 3.1: gRPC Server Streaming
Test-Request -TestName "gRPC Server Streaming: SayHelloStream" `
    -Request @{
        type = "GRPC"
        url = "localhost:50051"
        body = '{"name":"StreamTest"}'
        timeout = 30
        grpcConfig = @{
            service = "main.Greeter"
            method = "SayHelloStream"
            messageFormat = "JSON"
            callType = "server_stream"
            metadata = @{}
            useTLS = $false
            protoContent = $protoContent
        }
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

# Test 3.2: gRPC Bidirectional Streaming
Test-Request -TestName "gRPC Bidirectional Streaming" `
    -Request @{
        type = "GRPC"
        url = "localhost:50051"
        body = '[{"name":"client1"},{"name":"client2"}]'
        timeout = 30
        grpcConfig = @{
            service = "main.Greeter"
            method = "BidirectionalStream"
            messageFormat = "JSON"
            callType = "bidirectional_stream"
            metadata = @{}
            useTLS = $false
            protoContent = $protoContent
        }
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

Write-Host ""

# ==== TEST CATEGORY: MIXED PROTOCOL SCENARIOS ====
Write-Host "CATEGORY 4: Mixed Protocol Scenarios" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Yellow

# Test 4.1: HTTP followed by gRPC (simulated as separate requests)
Write-Host "  Testing: HTTP Request -> gRPC Request (sequential)" -ForegroundColor Cyan
$httpOk = Test-Request -TestName "HTTP Req (Part 1 of 2)" `
    -Request @{
        type = "HTTP"
        method = "GET"
        url = "https://httpbin.org/get"
        headers = @{}
        params = @{}
        body = ""
        timeout = 30
    } `
    -Validator { param($r) $r.statusCode -eq 200 }

if ($httpOk) {
    Test-Request -TestName "gRPC Req (Part 2 of 2)" `
        -Request @{
            type = "GRPC"
            url = "localhost:50051"
            body = '{"name":"AfterHTTP"}'
            timeout = 30
            grpcConfig = @{
                service = "main.Greeter"
                method = "SayHello"
                messageFormat = "JSON"
                callType = "unary"
                metadata = @{}
                useTLS = $false
                protoContent = $protoContent
            }
        } `
        -Validator { param($r) $r.statusCode -eq 200 }
}

Write-Host ""

# ==== SUMMARY ====
Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

$passCount = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$failCount = ($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$errorCount = ($testResults | Where-Object { $_.Status -eq "ERROR" }).Count
$totalCount = $testResults.Count

Write-Host "Total Tests:     $totalCount" -ForegroundColor Cyan
Write-Host "Passed:          $passCount" -ForegroundColor Green
Write-Host "Failed:          $failCount" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "Errors:          $errorCount" -ForegroundColor $(if ($errorCount -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

if ($failCount -eq 0 -and $errorCount -eq 0) {
    Write-Host "STATUS: ALL TESTS PASSED!" -ForegroundColor Green
} else {
    Write-Host "STATUS: SOME TESTS FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "Failed/Error Tests:" -ForegroundColor Red
    $testResults | Where-Object { $_.Status -ne "PASS" } | ForEach-Object {
        Write-Host "  - $($_.Name): $($_.Status)" -ForegroundColor Red
        if ($_.Error) {
            Write-Host "    Error: $($_.Error)" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
