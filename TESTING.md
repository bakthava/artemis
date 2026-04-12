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

**Step 19 Success**:
- Dev server runs without errors
- All 8 test scenarios pass
- Data persists across app restart
- No console errors on valid workflows

**Step 20 Success**:
- `wails build` completes successfully  
- Binary launches within 3 seconds
- Binary is <200 MB
- All Phase 4 features work in binary
- Data persists in binary

**Overall Success**: Artemis is production-ready
