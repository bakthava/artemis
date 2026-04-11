# Artemis - Modern HTTP Client for Windows

A lightweight, fast HTTP client for Windows. Simple, portable, and powerful.

## 🚀 Getting Started

### Start the Application

1. **Run** `artemis.exe` by double-clicking
2. App launches in 2-3 seconds
3. Ready to use immediately

## 📝 Create & Organize Requests

### Create a Collection
- Click **Collections** → **"+"** button
- Enter collection name (e.g., "My API", "Production")
- Collection appears in sidebar

### Add a Request to Collection
- Right-click collection name → **"Add Request"**
- Fill in request details:
  - **URL**: Enter endpoint
  - **Method**: Select GET, POST, PUT, DELETE, etc.
  - **Headers**: Add as needed
  - **Body**: Enter JSON or form data
- **Send**: Press `Ctrl+Enter` or click Send button
- View response in Response Viewer (status, body, headers, timing)

## 💾 Save Requests

### Save a Request
1. Complete your request
2. Press **`Ctrl+S`** or click **Save** button
3. Enter request name
4. Select collection to save to
5. Click **Save** → Request stored in collection

### Auto-Save
- Drafts auto-save to browser session
- Survives browser refresh
- Lost when app closes (unless manually saved)

## ⚙️ Settings

### Open Settings
- Click **Settings** icon (gear) in header
- Configure app preferences

### Available Settings
- **Timeout**: Request timeout in seconds
- **Auto-Save Interval**: Draft auto-save frequency
- **Clear History**: Remove saved request history
- **Reset Data**: Clear all collections and environments (cannot undo)

## 🌍 Environments & Variables

### Create Environment
- Click **EnvSelector** dropdown (top right)
- Click **"+"** → Enter environment name
- Click **Manage** to add variables

### Add Environment Variables
- Environment name text field (e.g., "Production")
- Add variables as Key-Value pairs:
  - **Key**: `BASEURL`
  - **Value**: `https://api.example.com`
- Save environment
- Variables available when environment is active

### Switch Environments
- Use **EnvSelector** dropdown to select active environment
- Variables scoped to selected environment

## ⌨️ Keyboard Shortcuts

```
Ctrl+K       Focus URL input field
Ctrl+Enter   Send request
Ctrl+S       Save current request
F5           Refresh (restores draft)
```

## 🧪 Testing Your Requests

### Test Scenarios

1. **Create Collection & Request**
   - Create collection
   - Add request with valid endpoint
   - Send and verify response

2. **Save Request Workflow**
   - Complete request
   - Press `Ctrl+S`
   - Save to collection
   - Verify appears in sidebar

3. **Environment Management**
   - Create environment
   - Add variables (BASEURL, API_KEY, etc.)
   - Use variables in requests
   - Switch environments and verify

4. **Keyboard Navigation**
   - Use `Ctrl+K` to focus URL
   - Use `Ctrl+S` to save
   - Use `Ctrl+Enter` to send

5. **Error Handling**
   - Send request to invalid URL
   - Verify error toast notification
   - Check error message in response

See **[TESTING.md](TESTING.md)** for detailed test scenarios.

## 📋 System Requirements

- **OS**: Windows 10 or Windows 11
- **RAM**: 256 MB minimum  
- **Disk**: 100 MB free
- **WebView2**: Built-in on Windows 11

## 📚 More Information

- **Full User Guide**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Test Cases**: See [TESTING.md](TESTING.md)
