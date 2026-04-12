# Artemis - Deployment & Release Guide

**Version**: 1.0  
**Date**: April 10, 2026  
**Status**: Production Ready ✅

---

## Quick Start

### Cross-Platform Releases

Artemis now supports packaged builds for:
- Windows 10 and Windows 11
- Linux
- macOS

Release builds are automated by GitHub Actions:
- Workflow file: `.github/workflows/release.yml`
- Trigger: push tag `v*` (for example `v1.0.0`) or manual dispatch

Nightly builds are also automated:
- Workflow file: `.github/workflows/nightly.yml`
- Trigger: daily schedule + manual dispatch
- Output: CI artifacts only (no GitHub Release publish)

Generated artifacts:
- `artemis-windows-amd64.zip`
- `artemis-linux-amd64.tar.gz`
- `artemis-linux-amd64.AppImage`
- `artemis-macos.zip`
- `SHA256SUMS.txt`

### Create a Release (Maintainer)

1. Commit and push your changes
2. Tag a version:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

3. Wait for the workflow to finish
4. Download artifacts from the GitHub Release page

### Nightly Build Usage

1. Open Actions tab
2. Run `Nightly Build` manually (or wait for scheduled run)
3. Download artifacts from workflow run summary

Nightly artifact examples:
- `artemis-nightly-windows-amd64.zip`
- `artemis-nightly-linux-amd64.tar.gz`
- `artemis-nightly-linux-amd64.AppImage`
- `artemis-nightly-macos.zip`

### macOS Signing and Notarization Placeholders

The release workflow includes gated placeholder steps for macOS signing and notarization.

Add these repository secrets to enable those steps:
- `APPLE_DEVELOPER_ID_APPLICATION`
- `APPLE_CERT_BASE64`
- `APPLE_CERT_PASSWORD`
- `KEYCHAIN_PASSWORD`
- `APPLE_NOTARY_APPLE_ID`
- `APPLE_NOTARY_TEAM_ID`
- `APPLE_NOTARY_APP_PASSWORD`

By default, those steps do not execute until the required secrets are present.

### Local Build Notes

For desktop GUI apps, prefer native builds on each OS:
- Build Windows on Windows
- Build Linux on Linux
- Build macOS on macOS

This avoids cross-compilation runtime issues for WebView and platform libraries.

### For Users
1. Download `artemis.exe` (11.6 MB)
2. Double-click to launch
3. App opens in new window
4. Start creating collections and making HTTP requests

### System Requirements
- **OS**: Windows 10 (Build 19041+) or Windows 11
- **WebView2 Runtime**: Included with Windows 11, can be installed on Windows 10
- **RAM**: Minimum 256 MB (recommended 512 MB+)
- **Disk**: 100 MB free space for app + database

---

## Installation

### Option 1: Portable (Recommended)
```powershell
# No installation needed!
# Simply download and run: artemis.exe

# Optional: Create shortcut
$exePath = "C:\path\to\artemis.exe"
$shortcut = [System.IO.Path]::Combine([Environment]::GetFolderPath("Desktop"), "Artemis.lnk")
$shell = New-Object -com "WScript.Shell"
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = $exePath
$link.Save()
```

### Option 2: Add to Path (Optional)
```powershell
# Add artemis.exe directory to environment variable PATH
# Then run from command line: artemis
```

### Option 3: Start Menu (Optional)
```powershell
# Copy shortcut to Start Menu folder
Copy-Item "Artemis.lnk" "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\"
```

---

## Data Location

### Database & Settings
- **Windows**: `%APPDATA%\artemis\artemis.db`
- **Full Path Example**: `C:\Users\YourName\AppData\Roaming\artemis\artemis.db`

### What's Stored
- Collections (organization of requests)
- Environments (API keys, URLs, variables)
- History (last 100 requests)
- Settings (themes, preferences)

### Backup & Recovery
```powershell
# Backup your data
Copy-Item "$env:APPDATA\artemis" "C:\Backups\artemis-backup" -Recurse

# Restore from backup
Copy-Item "C:\Backups\artemis-backup\*" "$env:APPDATA\artemis" -Recurse -Force

# Reset to factory defaults (WARNING: deletes all data)
Remove-Item "$env:APPDATA\artemis" -Recurse -Force
# App will recreate directory on next launch
```

---

## Features

### ✅ Implemented
- **Collections**: Organize requests into logical groups
- **Environments**: Manage API keys, base URLs, variables
- **Request Builder**: 
  - HTTP methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
  - URL input with parameter building
  - Headers editor
  - Request body (JSON, form-encoded, plain text)
  - Authentication (Basic, Bearer token)
- **Response Viewer**:
  - Status code display
  - Response body (JSON pretty-print, plain text)
  - Response headers
  - Response time & size
- **History**: Last 100 requests
- **Keyboard Shortcuts**:
  - `Ctrl+K`: Focus URL input
  - `Ctrl+Enter`: Send request
  - `Ctrl+S`: Save request
- **Auto-Save**: Draft requests saved to session storage
- **Notifications**: Toast notifications for all actions
- **Responsive Design**: Works on desktop, tablet, mobile

### 🔄 Coming Soon
- [ ] Variable substitution in URLs/headers/body ({{BASEURL}})
- [ ] Request/response syntax highlighting
- [ ] Request templates & scripting
- [ ] Proxy configuration
- [ ] SSL certificate bypass
- [ ] Dark mode toggle
- [ ] cURL & Postman import/export

### ❌ Not Supported
- GraphQL (POST JSON with graphql query)
- WebSocket connections
- Server-Sent Events (SSE)
- File upload/download
- Multipart form data
- Request chaining/workflows

---

## Troubleshooting

### Common Issues

**Issue**: App won't start
```
Solution: 
1. Ensure WebView2 runtime is installed
   - Windows 11: Built-in
   - Windows 10: Download from https://developer.microsoft.com/en-us/microsoft-edge/webview2/
2. Check minimum OS version (Windows 10 Build 19041+)
3. Ensure 256 MB RAM available
```

**Issue**: Requests timeout or fail
```
Solution:
1. Check internet connection
2. Verify URL is correct and accessible
3. Increase timeout setting (default: 30s)
4. Check proxy settings if behind corporate network
5. Disable VPN temporarily to test
```

**Issue**: Data disappeared after app crash
```
Solution:
1. Data should be restored from LevelDB
2. If corrupted, delete %APPDATA%\artemis\artemis.db
3. App will initialize fresh database on restart
   (NOTE: You'll lose all collections/history)
```

**Issue**: Slow startup
```
Solution:
1. Close browser DevTools
2. Disable antivirus scanning of %APPDATA%\artemis
3. Check available RAM (need 256 MB minimum)
4. Restart computer if memory is fragmented
```

---

## Uninstall

### Complete Removal
```powershell
# Delete the executable
Remove-Item "C:\path\to\artemis.exe"

# Delete configuration & database (optional)
Remove-Item "$env:APPDATA\artemis" -Recurse -Force

# Remove shortcuts
Remove-Item "$env:desktop\Artemis.lnk" -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Artemis.lnk" -ErrorAction SilentlyContinue
```

---

## Build Information

**Build Date**: April 10, 2026  
**Platform**: Windows x64  
**Go Version**: 1.23.0  
**Wails Version**: v2.12.0  
**Framework**: React 18  
**Database**: LevelDB  

### Technical Details
```
Binary Size:       11.6 MB
Memory (Idle):     44 MB
Startup Time:      ~2-3 seconds
Database Type:     LevelDB key-value store
Frontend:          React with Context API
Backend:           Go with Wails RPC
Hot Reload:        Disabled in production
```

---

## Source Code

Development and contributions welcome!

- **Repository**: Will be available at GitHub
- **License**: TBD
- **Issues & Feedback**: GitHub Issues
- **Contributions**: GitHub Pull Requests

---

## Support

### Getting Help
1. **Check Troubleshooting**: Above section
2. **Review TESTING.md**: Test scenarios and workflows
3. **Check logs**: Look at Windows event viewer or app console

### Known Limitations
- No variable substitution yet (plan to add in v2.0)
- JSON responses only (no XML formatting)
- Limited to 100 request history entries
- No request scheduling or automation

---

## Changelog

### Version 1.0 (April 10, 2026)
**Initial Release**
- Full HTTP request builder
- Collections and Environments
- Request history
- Toast notifications
- Keyboard shortcuts
- Auto-save draft requests
- Responsive design
- LevelDB persistence

### Future Versions
- v2.0: Variable substitution, syntax highlighting
- v2.1: Request templates, scripting
- v3.0: Team collaboration, cloud sync

---

## License & Credits

### Built With
- [Go](https://golang.org/) - Backend language
- [Wails](https://wails.io/) - Desktop framework
- [React 18](https://react.dev/) - UI framework
- [LevelDB](https://github.com/syndtr/goleveldb) - Database

### System Libraries
- Windows WebView2
- Go standard library

---

## End User Agreement

By using Artemis, you agree to:
- Use for lawful HTTP requests only
- Not use to attack or harm others' systems
- No guarantee of data persistence

Artemis is provided "as-is" without warranty.

---

## Privacy

Artemis does **NOT**:
- Collect usage data
- Phone home or check for updates
- Store requests on remote servers
- Require login or account

All data stored locally on your machine in `%APPDATA%\artemis\`

---

**Thank you for using Artemis! Happy testing! 🚀**
