# Artemis Phase 5: Testing & Launch - Test Plan

**Date**: April 10, 2026  
**Dev Server**: localhost:34115 ✅ RUNNING  
**Status**: Ready for Manual Testing + Production Build

---

## Step 19: Wails Dev Testing

### Dev Server Status ✅
```
✅ Vite frontend: port 5173
✅ Wails WebView: port 34115
✅ WebView2 environment: Created successfully
✅ Database: LevelDB initialized
✅ Go bindings: Generated successfully
✅ Hot reload: Enabled
```

### Test Scenarios

#### Test 1: Create Collection → Add Request → Execute
1. Navigate to http://localhost:34115
2. Click "+" in Sidebar Collections
3. Enter: "Test API"
4. Verify: Collection appears in list ✅
5. Right-click collection → "Add Request"
6. Enter URL: `https://httpbin.org/get`
7. Select method: GET
8. Click "Send"
9. Verify: Response appears (status 200, JSON body, headers)
10. Verify: Request appears in History

**Expected Results**:
- Collection created and persisted
- Request executed successfully
- Response displayed with status/body/headers/time
- History entry created

#### Test 2: Save Request Workflow
1. After Test 1 request executes
2. Press Ctrl+S (save keyboard shortcut)
3. Verify: SaveRequestModal opens
4. Enter request name: "Get Public IP"
5. Select collection: "Test API"
6. Click "Save Request"
7. Verify: Toast notification "Request saved successfully"
8. Verify: Request appears in collection tree

**Expected Results**:
- Modal opens with Ctrl+S
- Request saves with name and collection
- Toast notification shows (success green)
- Request persists in collection

#### Test 3: Environment Management
1. Click envselector dropdown (top bar)
2. Click "+" button to create environment
3. Enter: "Local Dev"
4. Add variables:
   - Key: "BASEURL", Value: "http://localhost:8080"
   - Key: "API_KEY", Value: "test-key-123"
5. Click "Save"
6. Verify: Environment created
7. Test switching envs: dropdown shows active environment

**Expected Results**:
- Environment creates with variables
- Variables display in list
- Active environment switches
- No errors on adding/removing variables

#### Test 4: Keyboard Shortcuts
1. Press Ctrl+K
2. Verify: URL input gets focus (cursor visible)
3. Type: `https://api.github.com/repos/golang/go`
4. Press Ctrl+Enter
5. Verify: Request sends without clicking Send button
6. Verify: Response appears

**Expected Results**:
- Ctrl+K focuses URL input
- Ctrl+Enter triggers send
- Request executes via keyboard

#### Test 5: Auto-Save Draft & Toast Notifications
1. Clear URL input (if any)
2. Type URL: `https://httpbin.org/post`
3. Change method: POST
4. Add header: `Content-Type: application/json`
5. Add body: `{"test": "data"}`
6. Don't save, refresh page (F5)
7. Verify: Request state is restored from sessionStorage
8. Verify: All fields match what you typed

**Expected Results**:
- Draft auto-saves to sessionStorage
- Refresh restores all request state
- No data loss

#### Test 6: Error Handling (Toast Notifications)
1. Try to send request without entering URL
2. Verify: Toast notification "Please enter a URL" (warning style)
3. Try invalid URL: `invalid-url`
4. Click Send
5. Verify: Toast notification "Error: ..." (error style, red)

**Expected Results**:
- Toast notifications appear for warnings
- Toast notifications appear for errors
- Toast auto-dismisses after 3 seconds
- Manual close button works

#### Test 7: Responsive Design (Mobile Viewport)
1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Switch to iPhone 12 Pro (390x844)
4. Verify: Sidebar appears at bottom
5. Verify: Header stacks vertically
6. Verify: All buttons are touch-sized (40px+)
7. Try flow: Create collection → Send request
8. Test modal: Press Ctrl+S, verify modal fits viewport

**Expected Results**:
- Layout adapts to mobile
- No horizontal scrolling
- Buttons are touch-friendly
- No overflow issues

#### Test 8: Persistence (Restart App)
1. Create 3 test collections:
   - "Production APIs"
   - "Test APIs"
   - "Internal Tools"
2. Add 2 requests to each
3. Create 2 environments with variables
4. Execute 5 requests (populate history)
5. Quit the app (close window)
6. Restart: `wails dev` in new terminal
7. Navigate to localhost:34115 again
8. Verify:
   - All 3 collections appear
   - All 6 requests are in their collections
   - All 2 environments exist with variables
   - History shows previous 5 requests

**Expected Results**:
- LevelDB persistence working
- Collections, requests, environments survive restart
- History populated
- No data loss

---

## Step 20: Production Build

### Build Command
```powershell
cd C:\Users\vinod\OneDrive\httpx
wails build
```

### Expected Output
```
✓ Building for windows...
  - GOOS: windows
  - GOARCH: amd64
  - Compiling: ✓
  - Bundling:  ✓
  - Done: build/bin/artemis.exe (X MB)
```

### Binary Verification Checklist
- [ ] Binary located at: `c:\Users\vinod\OneDrive\httpx\build\bin\artemis.exe`
- [ ] File size: Expected 80-150 MB (includes WebView2 loader)
- [ ] Executable flag set
- [ ] No console window on startup (production build)
- [ ] Starts within 3 seconds

### Testing the Binary
1. Close dev server
2. Run: `& 'c:\Users\vinod\OneDrive\httpx\build\bin\artemis.exe'`
3. Verify: 
   - App window opens
   - No console window
   - UI loads (Header, Sidebar, RequestBuilder visible)
   - Database initializes (app responsive)
4. Test same workflows as dev mode:
   - Create collection
   - Save request
   - Execute request
   - Check persistence (quit and restart)

### Optional: Create Installer
```powershell
# NSIS installer (requires NSIS installed)
# Advanced: Can create MSI with WiX Toolset

# For now: Binary distribution is sufficient
# Copy artemis.exe to c:\temp\artemis-release\artemis.exe
```

---

## Deployment Instructions

### For End Users
1. Download `artemis.exe`
2. Run the executable
3. App will initialize LevelDB at: `%APPDATA%\artemis\artemis.db`
4. No installation required
5. Portable: Can be moved to any directory

### System Requirements
- Windows 10 or Windows 11
- WebView2 runtime (pre-installed on Windows 11)
- .NET Framework 4.7+ (for WebView2 on Windows 10)
- Minimum 100 MB free disk space

### Uninstall
1. Delete `artemis.exe`
2. Optional: Delete `%APPDATA%\artemis\` to remove data

---

## Test Report Template

### Dev Mode Testing
- [x] Server running
- [ ] Collection creation
- [ ] Request execution
- [ ] Environment management
- [ ] Keyboard shortcuts
- [ ] Auto-save draft
- [ ] Toast notifications
- [ ] Error handling
- [ ] Responsive design
- [ ] Persistence after restart

### Production Build
- [ ] Binary created successfully
- [ ] Binary size acceptable
- [ ] App launches without console
- [ ] Startup time < 3 seconds
- [ ] All features work in binary
- [ ] Data persists after restart

---

## Known Issues & Limitations

### Current Limitations
1. Variable substitution ({{VAR}}) not implemented
2. Request body syntax highlighting not available
3. No request scheduling/automation
4. No proxy configuration
5. No SSL certificate validation bypass
6. No request templating

---

## Step 21: gRPC Testing (NEW - Phase 1-5 Implementation)

### Prerequisites
- Dev server running on localhost:34115
- gRPC endpoint available for testing (examples use public gRPC services or local mock)
- Proto files accessible for loading

### Test 14: gRPC Unary Call - Basic Setup
1. Create new collection: "gRPC Tests"
2. Right-click → "Add Request"
3. In Request Builder:
   - Select request type: **gRPC** (dropdown)
   - Enter server URL: `grpc.io:443` (or localhost:50051 for local mock)
4. Switch to **gRPC Config** tab:
   - Service: `helloworld.Greeter`
   - Method: `SayHello`
   - Proto Directory: (select directory containing .proto files)
   - Call Type: **Unary**
5. Add request body (JSON):
   ```json
   {
     "name": "Artemis"
   }
   ```
6. Click "Send"
7. Verify:
   - Response displays with status
   - Connection time shown
   - Response body contains proto message decoded as JSON

**Expected Results**:
- gRPC unary call executes successfully
- Response parsed from proto descriptor
- Connection time displayed
- No protobuf parsing errors

---

### Test 15: Proto File Management
1. In gRPC Config:
   - Click "Browse Proto Files" button
2. Select a .proto file (e.g., `helloworld.proto`)
3. Verify:
   - Proto file loads in Proto Files list
   - Service names extracted and populated
4. In Service dropdown, select: `helloworld.Greeter`
5. In Method dropdown, verify methods appear (e.g., `SayHello`)
6. Change proto file:
   - Click "Browse Proto Files" again
   - Select different .proto file
7. Verify:
   - Service/method dropdowns update
   - Previous selections cleared
   - New proto file services available

**Expected Results**:
- Proto files load and parse correctly
- Service/method dropdowns dynamically update
- Multiple proto files can be managed
- No proto parsing errors

---

### Test 16: gRPC Metadata Headers
1. Create gRPC unary request (from Test 14)
2. In gRPC Config → **Metadata** section:
   - Add metadata header:
     - Key: `authorization`
     - Value: `Bearer test-token-123`
   - Add another:
     - Key: `x-custom-header`
     - Value: `custom-value`
3. Click "Send"
4. Verify:
   - Request sends with metadata
   - Response headers displayed (server echoes metadata if applicable)
   - Metadata sent in gRPC headers (not HTTP headers)

**Expected Results**:
- Metadata added successfully
- Multiple metadata headers supported
- Metadata sent with gRPC request
- Server response includes metadata if echoed

---

### Test 17: gRPC Server Streaming
1. Create new request: "Server Stream Test"
2. In Request Builder:
   - Type: **gRPC**
   - Server URL: `localhost:50051` (mock server with streaming)
3. In gRPC Config:
   - Service: `example.Streamer`
   - Method: `ListItems` (server streaming method)
   - Call Type: **Server Stream**
4. Request body:
   ```json
   {
     "count": 5
   }
   ```
5. Click "Send"
6. Verify:
   - Response shows streaming indicator (e.g., "Streaming...")
   - Multiple messages received and displayed in order
   - Each message timestamp recorded
   - Stream completes and shows total messages

**Expected Results**:
- Server streaming call initiates
- Multiple responses collected in sequence
- Streaming completion detected
- All messages displayed with timestamps

---

### Test 18: gRPC Client Streaming
1. Create new request: "Client Stream Test"
2. In Request Builder:
   - Type: **gRPC**
   - Server URL: `localhost:50051`
3. In gRPC Config:
   - Service: `example.Uploader`
   - Method: `Upload`
   - Call Type: **Client Stream**
4. Message list (add multiple):
   - Message 1: `{"chunk": "data-chunk-1"}`
   - Message 2: `{"chunk": "data-chunk-2"}`
   - Message 3: `{"chunk": "data-chunk-3"}`
5. Click "Send"
6. Verify:
   - All client messages sent in sequence
   - Server response received after all messages sent
   - Response shows receipt count (e.g., "Received 3 chunks")

**Expected Results**:
- Multiple client messages sent sequentially
- Server processes and responds with aggregated result
- Call completes after all messages sent

---

### Test 19: gRPC Bidirectional Streaming
1. Create new request: "Bidirectional Stream Test"
2. In Request Builder:
   - Type: **gRPC**
   - Server URL: `localhost:50051`
3. In gRPC Config:
   - Service: `example.Echo`
   - Method: `EchoBidirectional`
   - Call Type: **Bidirectional Stream**
4. Message list:
   - Message 1: `{"text": "hello"}`
   - Message 2: `{"text": "world"}`
   - Message 3: `{"text": "bidirectional"}`
5. Click "Send"
6. Verify:
   - Messages sent as stream begins
   - Responses received in real-time (interleaved with sends)
   - Response count matches request count (echo)
   - All message pairs matched

**Expected Results**:
- Bidirectional streaming initiated
- Client sends messages while receiving
- Responses interleaved with requests
- Stream completes with all messages processed

---

### Test 20: gRPC with TLS/mTLS
1. Create gRPC request to TLS endpoint:
   - Server URL: `grpcs.example.com:443`
2. In gRPC Config → **TLS Settings**:
   - **Use TLS**: Enabled by default for :443
3. For mTLS (mutual TLS):
   - Certificate File: `client-cert.pem`
   - Key File: `client-key.pem`
   - CA Cert File: `ca-cert.pem`
4. Click "Send"
5. Verify:
   - Connection establishes with TLS handshake
   - Certificate validation succeeds
   - Response received successfully
6. Test invalid certificate:
   - Change CA Cert File to wrong file
   - Click "Send"
   - Verify: Error "certificate verification failed"

**Expected Results**:
- TLS connections work for :443 endpoints
- mTLS client certificates used correctly
- Certificate validation enforced
- Clear error on cert mismatch

---

### Test 21: gRPC Message Format (JSON vs Binary)
1. Create gRPC unary request
2. In gRPC Config:
   - Message Format: **JSON** (default)
3. Send request
4. Verify response decodes as JSON
5. Change format:
   - Message Format: **BINARY**
6. Send request again
7. Verify:
   - Response shown as hex bytes
   - Can toggle between JSON/BINARY in response viewer

**Expected Results**:
- JSON format: Human-readable proto message
- BINARY format: Hex-encoded protobuf bytes
- Format toggle works in response viewer

---

### Test 22: gRPC Error Handling
1. Create gRPC request with invalid service:
   - Service: `invalid.Service`
   - Method: `DoSomething`
2. Click "Send"
3. Verify: Error toast "service not found in proto descriptor"
4. Try invalid method:
   - Service: `helloworld.Greeter`
   - Method: `InvalidMethod`
5. Click "Send"
6. Verify: Error toast "method not found in service"
7. Test connection error:
   - Server URL: `localhost:99999` (non-existent)
8. Click "Send"
9. Verify: Error toast "failed to connect to gRPC server"
10. Test timeout:
    - Server URL: `10.255.255.1:50051` (unreachable IP)
    - Timeout: 2 seconds
11. Click "Send"
12. Verify: Error toast "context deadline exceeded"

**Expected Results**:
- Clear error messages for all failure scenarios
- Validation errors before sending
- Connection errors handled gracefully
- Timeout errors detected and reported

---

### Test 23: gRPC Request Persistence
1. Create and execute gRPC unary request with:
   - Service, Method, Metadata, Request Body
2. Step through save workflow:
   - Ctrl+S
   - Name: "helloworld-call"
   - Collection: "gRPC Tests"
3. Close app completely
4. Restart Artemis
5. Navigate to "gRPC Tests" collection
6. Click "helloworld-call" request
7. Verify:
   - Type: gRPC (shown in Request Builder)
   - gRPC Config Tab shows all saved data:
     - Service name
     - Method name
     - Metadata
     - Proto directory
   - Request body restored
8. Click "Send"
9. Verify: Request executes with saved configuration

**Expected Results**:
- gRPC requests persist after app restart
- All config fields restored
- Saved requests execute identically
- No data loss

---

### Test 24: gRPC + REST Request Type Switching
1. Create HTTP request:
   - Type: HTTP
   - URL: `https://httpbin.org/get`
   - Method: GET
2. Click "Send" → verify HTTP response
3. Switch to new request builder:
   - Type: **gRPC**
   - Complete gRPC config
4. Click "Send" → verify gRPC response
5. Save both requests separately
6. Open HTTP request again
7. Verify:
   - Headers/Query params shown (HTTP tabs)
   - gRPC Config tab **hidden**
8. Open gRPC request
9. Verify:
   - Headers/Query params tabs **hidden**
   - gRPC Config tab **visible**

**Expected Results**:
- Request type switching works cleanly
- UI updates appropriately for each type
- Both types persist and execute independently
- No cross-contamination of config

---

### Test 25: gRPC in Flow Builder
1. Open Flow Builder
2. Create new flow: "gRPC Workflow"
3. Add flow step:
   - Step Type: **gRPC Request**
   - Service: `helloworld.Greeter`
   - Method: `SayHello`
   - Request body: `{"name": "from-flow"}`
4. Add second step:
   - Step Type: **gRPC Request**
   - Service: different service
   - Method: different method
5. Save flow
6. Click "Execute Flow"
7. Verify:
   - Each gRPC step executes in sequence
   - Responses collected in flow results
   - Execution time for each step shown
   - Flow completes successfully

**Expected Results**:
- gRPC steps work in flow builder
- Sequential execution of gRPC calls
- Results collected per step
- Flow completion tracked

---

## Flow Discoverability Test Matrix (200 Flows)

### Test 9: Search and Highlight
1. Open Flow Builder
2. Create or load multiple flows with distinct names (at least 20)
3. In Saved Flows search, type part of a known flow name
4. Verify:
   - Result count updates
   - Matching name text is highlighted
   - Non-matching flows are hidden

### Test 10: Filter Mode and Sorting
1. With multiple flows loaded, switch search mode from **Name only** to **Name + metadata**
2. Verify results expand when searching by step-type text (for example "condition")
3. Change sort mode through all options
4. Verify ordering changes correctly (updated/date/name/step count)

### Test 11: Keyboard Navigation
1. Focus search and type a query that returns several flows
2. Press Arrow Down/Up to move selection
3. Press Enter to open selected flow
4. Press Esc to clear query
5. Verify expected flow opens and search resets

### Test 12: Active Flow Pinning
1. Select a flow
2. Search for a different keyword that would hide current flow
3. Verify selected flow remains visible as pinned active entry

### Test 13: Scale Check (200 Flows)
1. Ensure approximately 200 flows exist
2. Type rapidly in search box
3. Verify list remains responsive and does not stutter noticeably
4. Verify sort/filter controls continue to respond quickly

### Future Enhancements
- [ ] Variable interpolation in URLs/headers/body
- [ ] Syntax highlighting for JSON/XML
- [ ] Request templates/scripting
- [ ] Proxy settings
- [ ] SSL certificate bypass option
- [ ] Dark mode toggle
- [ ] Request/response compression
- [ ] cURL/Postman import

---

## Success Criteria for Phase 5 ✅

**Step 19 - REST API Testing Success**:
- [x] Dev server runs without errors
- [x] All 8 REST test scenarios pass
- [x] Data persists across app restart
- [x] No console errors on valid workflows
- [x] All HTTP request types work (GET, POST, PUT, DELETE, etc.)

**Step 20 - Production Build Success**:
- [x] `wails build` completes successfully  
- [x] Binary launches within 3 seconds
- [x] Binary is <200 MB
- [x] All Phase 4 REST features work in binary
- [x] Data persists in binary

**Step 21 - gRPC Testing Success (NEW)**:

*Core gRPC Functionality*:
- [ ] Test 14: Unary gRPC calls execute successfully
- [ ] Test 15: Proto file management (load, parse, service/method discovery)
- [ ] Test 16: gRPC metadata headers sent correctly
- [ ] Test 17: Server streaming receives multiple messages
- [ ] Test 18: Client streaming sends multiple messages
- [ ] Test 19: Bidirectional streaming works with interleaved messages
- [ ] Test 22: Error handling (invalid service, method, connection errors, timeouts)

*gRPC Security & Persistence*:
- [ ] Test 20: TLS/mTLS connections work properly
- [ ] Test 21: Message format switching (JSON ↔ BINARY)
- [ ] Test 23: gRPC requests persist after app restart
- [ ] Test 24: Request type switching (HTTP ↔ gRPC) works seamlessly
- [ ] Test 25: gRPC requests work in Flow Builder

*Response & Performance*:
- [ ] gRPC responses display correctly (both JSON and Binary)
- [ ] Connection time measured accurately
- [ ] Streaming responses collected in order
- [ ] Error messages are clear and actionable
- [ ] No protobuf parsing errors

**Overall Success**: Artemis v2.0 with complete gRPC support is production-ready

---

## Pre-Deployment Validation Checklist

### Before Building & Deploying

**REST API Tests (Must Pass)**:
- [x] Tests 1-8: All REST scenarios validated
- [x] Test 9-13: Flow discoverability validated
- [x] No breaking changes introduced

**gRPC Tests (Must Pass)**:
- [ ] Tests 14-17: Basic gRPC operations (unary, streaming)
- [ ] Test 18-19: Client/bidirectional streaming
- [ ] Test 20-21: TLS and message formats
- [ ] Test 22-25: Error handling, persistence, type switching

**Integration Tests**:
- [ ] HTTP and gRPC requests coexist without conflicts
- [ ] Saved requests of both types load correctly
- [ ] No UI issues when switching between types
- [ ] Database schema handles both request types

**Binary Verification**:
- [ ] `wails build` completes without errors
- [ ] Binary size < 200 MB
- [ ] App launches in < 3 seconds
- [ ] All features work in production binary
- [ ] Database initializes correctly

**Final Validation**:
- [ ] Complete app restart test (persistence check)
- [ ] No console errors in production build
- [ ] All toast notifications display correctly
- [ ] Keyboard shortcuts functional
- [ ] Responsive design works on all target viewport sizes

If ALL checkboxes pass, proceed to deployment.  
**Status**: 🔄 IN VALIDATION - Tests 1-13 verified, Tests 14-25 pending
