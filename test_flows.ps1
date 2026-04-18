# Test Script for Mixed Protocol Flow (HTTP, HTTPS, gRPC)
# This script creates and tests flows with mixed protocols

$apiBase = "http://localhost:9090/api"
$testResults = @()

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Uri,
        [hashtable]$Body,
        [string]$Description
    )
    
    try {
        $params = @{
            Method = $Method
            Uri = $Uri
            ContentType = 'application/json'
            ErrorAction = 'Stop'
        }
        
        if ($Body) {
            $params['Body'] = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-WebRequest @params
        $result = $response.Content | ConvertFrom-Json
        
        Write-Host "✓ $Name - PASSED" -ForegroundColor Green
        Write-Host "  Description: $Description"
        Write-Host "  Status: $($response.StatusCode)" -ForegroundColor Gray
        
        $testResults += @{
            Name = $Name
            Status = "PASSED"
            StatusCode = $response.StatusCode
            Description = $Description
        }
        
        return $result
    }
    catch {
        Write-Host "✗ $Name - FAILED" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Yellow
        
        $testResults += @{
            Name = $Name
            Status = "FAILED"
            Error = $_.Exception.Message
            Description = $Description
        }
        
        return $null
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ARTEMIS FLOW TEST SUITE" -ForegroundColor Cyan
Write-Host "Testing Mixed Protocol Flows (HTTP, HTTPS, gRPC)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Get proto file to use for gRPC (we'll use a simple request-response proto)
Write-Host "[STEP 1] Preparing gRPC Proto File" -ForegroundColor Yellow
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

# Test 2: Create HTTP Flow
Write-Host ""
Write-Host "[STEP 2] Creating Test Flows" -ForegroundColor Yellow
Write-Host ""

# Test 2a: HTTP GET Request
$httpGetFlow = @{
    name = "Test Flow: HTTP GET"
    steps = @(
        @{
            type = "start"
            id = "start"
            name = "Start"
            enabled = $true
        },
        @{
            type = "request"
            id = "http-get"
            name = "HTTP GET Request"
            enabled = $true
            requestType = "HTTP"
            request = @{
                method = "GET"
                url = "https://httpbin.org/get"
                headers = @{}
                params = @{}
                body = ""
                bodyType = "json"
            }
            grpcConfig = @{
                service = ""
                method = ""
                message = ""
                protoPath = ""
                protoContent = ""
                messageFormat = "JSON"
                metadata = @{}
                callType = "unary"
                useTLS = $false
            }
            extractions = @()
            assertions = @()
        },
        @{
            type = "end"
            id = "end"
            name = "End"
            enabled = $true
        }
    )
}

# Test 2b: HTTPS POST Request
$httpsPostFlow = @{
    name = "Test Flow: HTTPS POST"
    steps = @(
        @{
            type = "start"
            id = "start"
            name = "Start"
            enabled = $true
        },
        @{
            type = "request"
            id = "https-post"
            name = "HTTPS POST Request"
            enabled = $true
            requestType = "HTTP"
            request = @{
                method = "POST"
                url = "https://httpbin.org/post"
                headers = @{
                    "Content-Type" = "application/json"
                }
                params = @{}
                body = '{"test":"data","flow":"artemis"}'
                bodyType = "json"
            }
            grpcConfig = @{
                service = ""
                method = ""
                message = ""
                protoPath = ""
                protoContent = ""
                messageFormat = "JSON"
                metadata = @{}
                callType = "unary"
                useTLS = $false
            }
            extractions = @()
            assertions = @()
        },
        @{
            type = "end"
            id = "end"
            name = "End"
            enabled = $true
        }
    )
}

# Test 2c: gRPC Plaintext Request
$grpcPlaintextFlow = @{
    name = "Test Flow: gRPC Plaintext"
    steps = @(
        @{
            type = "start"
            id = "start"
            name = "Start"
            enabled = $true
        },
        @{
            type = "request"
            id = "grpc-plain"
            name = "gRPC Plaintext Request"
            enabled = $true
            requestType = "GRPC"
            request = @{
                method = ""
                url = ""
                headers = @{}
                params = @{}
                body = ""
                bodyType = "json"
            }
            grpcConfig = @{
                url = "localhost:50051"
                service = "helloworld.Greeter"
                method = "SayHello"
                message = '{"name":"Artemis"}'
                protoPath = ""
                protoContent = $protoContent
                messageFormat = "JSON"
                metadata = @{
                    "user-agent" = "artemis-test"
                }
                callType = "unary"
                useTLS = $false
                certificateFile = ""
                keyFile = ""
                caCertFile = ""
            }
            extractions = @(
                @{
                    variable = "grpcMessage"
                    source = "body"
                    jsonPath = "$.message"
                }
            )
            assertions = @(
                @{
                    source = "statusCode"
                    operator = "equals"
                    expected = "200"
                }
            )
        },
        @{
            type = "end"
            id = "end"
            name = "End"
            enabled = $true
        }
    )
}

# Test 2d: Mixed Protocol Flow (HTTP -> gRPC)
$mixedFlow = @{
    name = "Test Flow: Mixed HTTP and gRPC"
    steps = @(
        @{
            type = "start"
            id = "start"
            name = "Start"
            enabled = $true
        },
        @{
            type = "request"
            id = "http-first"
            name = "HTTP Request First"
            enabled = $true
            requestType = "HTTP"
            request = @{
                method = "GET"
                url = "https://httpbin.org/get"
                headers = @{}
                params = @{}
                body = ""
                bodyType = "json"
            }
            grpcConfig = @{
                service = ""
                method = ""
                message = ""
                protoPath = ""
                protoContent = ""
                messageFormat = "JSON"
                metadata = @{}
                callType = "unary"
                useTLS = $false
            }
            extractions = @()
            assertions = @()
        },
        @{
            type = "request"
            id = "grpc-second"
            name = "gRPC Request Second"
            enabled = $true
            requestType = "GRPC"
            request = @{
                method = ""
                url = ""
                headers = @{}
                params = @{}
                body = ""
                bodyType = "json"
            }
            grpcConfig = @{
                url = "localhost:50051"
                service = "helloworld.Greeter"
                method = "SayHello"
                message = '{"name":"Mixed-Protocol-Test"}'
                protoPath = ""
                protoContent = $protoContent
                messageFormat = "JSON"
                metadata = @{}
                callType = "unary"
                useTLS = $false
                certificateFile = ""
                keyFile = ""
                caCertFile = ""
            }
            extractions = @()
            assertions = @()
        },
        @{
            type = "end"
            id = "end"
            name = "End"
            enabled = $true
        }
    )
}

# Test 3: Execute flows
Write-Host "[STEP 3] Executing Test Flows" -ForegroundColor Yellow
Write-Host ""

# Test HTTP GET
Write-Host "  → Testing HTTP GET Request..." -ForegroundColor Cyan
try {
    $httpGetReq = @{
        type = "HTTP"
        method = "GET"
        url = "https://httpbin.org/get"
        headers = @{}
        params = @{}
        body = ""
        timeout = 30
    }
    
    $response = Invoke-WebRequest -Uri "$apiBase/request/execute" `
        -Method POST `
        -ContentType 'application/json' `
        -Body ($httpGetReq | ConvertTo-Json -Depth 10) `
        -ErrorAction Stop
    
    $result = $response.Content | ConvertFrom-Json
    if ($result.statusCode -eq 200) {
        Write-Host "    ✓ HTTP GET - PASSED (Status: 200)" -ForegroundColor Green
        $testResults += @{
            Name = "HTTP GET Request"
            Status = "PASSED"
            StatusCode = 200
            Description = "HTTP GET to https://httpbin.org/get"
        }
    } else {
        Write-Host "    ✗ HTTP GET - FAILED (Status: $($result.statusCode))" -ForegroundColor Red
        $testResults += @{
            Name = "HTTP GET Request"
            Status = "FAILED"
            StatusCode = $result.statusCode
            Description = "HTTP GET to https://httpbin.org/get"
        }
    }
}
catch {
    Write-Host "    ✗ HTTP GET - ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $testResults += @{
        Name = "HTTP GET Request"
        Status = "FAILED"
        Error = $_.Exception.Message
        Description = "HTTP GET to https://httpbin.org/get"
    }
}

# Test HTTPS POST
Write-Host "  → Testing HTTPS POST Request..." -ForegroundColor Cyan
try {
    $httpsPostReq = @{
        type = "HTTP"
        method = "POST"
        url = "https://httpbin.org/post"
        headers = @{
            "Content-Type" = "application/json"
        }
        params = @{}
        body = '{"test":"data","flow":"artemis"}'
        timeout = 30
    }
    
    $response = Invoke-WebRequest -Uri "$apiBase/request/execute" `
        -Method POST `
        -ContentType 'application/json' `
        -Body ($httpsPostReq | ConvertTo-Json -Depth 10) `
        -ErrorAction Stop
    
    $result = $response.Content | ConvertFrom-Json
    if ($result.statusCode -eq 200) {
        Write-Host "    ✓ HTTPS POST - PASSED (Status: 200)" -ForegroundColor Green
        $testResults += @{
            Name = "HTTPS POST Request"
            Status = "PASSED"
            StatusCode = 200
            Description = "HTTPS POST to https://httpbin.org/post"
        }
    } else {
        Write-Host "    ✗ HTTPS POST - FAILED (Status: $($result.statusCode))" -ForegroundColor Red
        $testResults += @{
            Name = "HTTPS POST Request"
            Status = "FAILED"
            StatusCode = $result.statusCode
            Description = "HTTPS POST to https://httpbin.org/post"
        }
    }
}
catch {
    Write-Host "    ✗ HTTPS POST - ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $testResults += @{
        Name = "HTTPS POST Request"
        Status = "FAILED"
        Error = $_.Exception.Message
        Description = "HTTPS POST to https://httpbin.org/post"
    }
}

# Test gRPC Plaintext
Write-Host "  → Testing gRPC Plaintext Request..." -ForegroundColor Cyan
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
            metadata = @{
                "user-agent" = "artemis-test"
            }
            useTLS = $false
            protoContent = $protoContent
        }
    }
    
    $response = Invoke-WebRequest -Uri "$apiBase/request/execute" `
        -Method POST `
        -ContentType 'application/json' `
        -Body ($grpcReq | ConvertTo-Json -Depth 10) `
        -ErrorAction Stop
    
    $result = $response.Content | ConvertFrom-Json
    if ($result.statusCode -eq 200) {
        Write-Host "    ✓ gRPC Plaintext - PASSED (Status: 200)" -ForegroundColor Green
        Write-Host "      Response: $($result.body | ConvertFrom-Json | ConvertTo-Json -Compress)" -ForegroundColor Gray
        $testResults += @{
            Name = "gRPC Plaintext Request"
            Status = "PASSED"
            StatusCode = 200
            Description = "gRPC unary call to localhost:50051"
        }
    } else {
        Write-Host "    ✗ gRPC Plaintext - FAILED (Status: $($result.statusCode))" -ForegroundColor Red
        if ($result.body) {
            Write-Host "      Error: $($result.body)" -ForegroundColor Yellow
        }
        $testResults += @{
            Name = "gRPC Plaintext Request"
            Status = "FAILED"
            StatusCode = $result.statusCode
            Description = "gRPC unary call to localhost:50051"
        }
    }
}
catch {
    Write-Host "    ✗ gRPC Plaintext - ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $testResults += @{
        Name = "gRPC Plaintext Request"
        Status = "FAILED"
        Error = $_.Exception.Message
        Description = "gRPC unary call to localhost:50051"
    }
}

# Test HTTP to HTTP with headers
Write-Host "  → Testing HTTP with Custom Headers..." -ForegroundColor Cyan
try {
    $httpHeadersReq = @{
        type = "HTTP"
        method = "GET"
        url = "https://httpbin.org/headers"
        headers = @{
            "X-Custom-Header" = "Artemis-Test"
            "User-Agent" = "Artemis-FlowTester/1.0"
        }
        params = @{}
        body = ""
        timeout = 30
    }
    
    $response = Invoke-WebRequest -Uri "$apiBase/request/execute" `
        -Method POST `
        -ContentType 'application/json' `
        -Body ($httpHeadersReq | ConvertTo-Json -Depth 10) `
        -ErrorAction Stop
    
    $result = $response.Content | ConvertFrom-Json
    if ($result.statusCode -eq 200) {
        Write-Host "    ✓ HTTP with Headers - PASSED (Status: 200)" -ForegroundColor Green
        $testResults += @{
            Name = "HTTP with Custom Headers"
            Status = "PASSED"
            StatusCode = 200
            Description = "HTTP GET with custom headers"
        }
    } else {
        Write-Host "    ✗ HTTP with Headers - FAILED (Status: $($result.statusCode))" -ForegroundColor Red
        $testResults += @{
            Name = "HTTP with Custom Headers"
            Status = "FAILED"
            StatusCode = $result.statusCode
            Description = "HTTP GET with custom headers"
        }
    }
}
catch {
    Write-Host "    ✗ HTTP with Headers - ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $testResults += @{
        Name = "HTTP with Custom Headers"
        Status = "FAILED"
        Error = $_.Exception.Message
        Description = "HTTP GET with custom headers"
    }
}

# Test HTTP OPTIONS
Write-Host "  → Testing HTTP OPTIONS Request..." -ForegroundColor Cyan
try {
    $httpOptionsReq = @{
        type = "HTTP"
        method = "OPTIONS"
        url = "https://httpbin.org/anything"
        headers = @{}
        params = @{}
        body = ""
        timeout = 30
    }
    
    $response = Invoke-WebRequest -Uri "$apiBase/request/execute" `
        -Method POST `
        -ContentType 'application/json' `
        -Body ($httpOptionsReq | ConvertTo-Json -Depth 10) `
        -ErrorAction Stop
    
    $result = $response.Content | ConvertFrom-Json
    if ($result.statusCode -eq 200 -or $result.statusCode -eq 204) {
        Write-Host "    ✓ HTTP OPTIONS - PASSED (Status: $($result.statusCode))" -ForegroundColor Green
        $testResults += @{
            Name = "HTTP OPTIONS Request"
            Status = "PASSED"
            StatusCode = $result.statusCode
            Description = "HTTP OPTIONS to https://httpbin.org/anything"
        }
    } else {
        Write-Host "    ✗ HTTP OPTIONS - FAILED (Status: $($result.statusCode))" -ForegroundColor Red
        $testResults += @{
            Name = "HTTP OPTIONS Request"
            Status = "FAILED"
            StatusCode = $result.statusCode
            Description = "HTTP OPTIONS to https://httpbin.org/anything"
        }
    }
}
catch {
    Write-Host "    ✗ HTTP OPTIONS - ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $testResults += @{
        Name = "HTTP OPTIONS Request"
        Status = "FAILED"
        Error = $_.Exception.Message
        Description = "HTTP OPTIONS to https://httpbin.org/anything"
    }
}

# Print Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$passedCount = ($testResults | Where-Object { $_.Status -eq "PASSED" }).Count
$failedCount = ($testResults | Where-Object { $_.Status -eq "FAILED" }).Count

$testResults | ForEach-Object {
    $statusColor = if ($_.Status -eq "PASSED") { "Green" } else { "Red" }
    Write-Host "$($_.Name): $($_.Status)" -ForegroundColor $statusColor
    Write-Host "  Description: $($_.Description)" -ForegroundColor Gray
    if ($_.StatusCode) {
        Write-Host "  Status Code: $($_.StatusCode)" -ForegroundColor Gray
    }
    if ($_.Error) {
        Write-Host "  Error: $($_.Error)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Total Tests: $($testResults.Count)" -ForegroundColor Cyan
Write-Host "Passed: $passedCount" -ForegroundColor Green
Write-Host "Failed: $failedCount" -ForegroundColor Red
Write-Host ""

if ($failedCount -eq 0) {
    Write-Host "✓ ALL TESTS PASSED!" -ForegroundColor Green
} else {
    Write-Host "✗ Some tests failed. Please review the errors above." -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
