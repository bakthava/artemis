Artemis Test Suite

Quick start

1. Start the Artemis app (frontend + backend) on `http://localhost:9090`.
2. Open a terminal in repo root.

Prerequisite checks (Windows PowerShell):

```powershell
cd .\tests
pwsh .\run-prereqs.ps1
```

Run full test suite (Windows PowerShell):

```powershell
pwsh .\run-all.ps1
```

Notes
- The UI smoke uses Playwright; to run UI tests ensure `npm install` executed in `frontend`.
- For advanced runs, use the `--base-url` and `--out` args when invoking the smoke script in `frontend/scripts/smoke-parameters.mjs`.
