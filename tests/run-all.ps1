# Run full test-suite: prereqs + UI smoke + API smoke
param(
  [string]$BaseUrl = 'http://localhost:9090'
)

Write-Host "Running full test-suite against $BaseUrl" -ForegroundColor Cyan

$testsDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Push-Location $testsDir

# 1. Prereqs
Write-Host "1) Prerequisite checks" -ForegroundColor Yellow
pwsh .\run-prereqs.ps1 -BaseUrl $BaseUrl
if ($LASTEXITCODE -ne 0) { Write-Host 'Prereqs failed - aborting test run' -ForegroundColor Red; exit 1 }

# 2. Run frontend smoke (parameters)
Write-Host "2) Running frontend Parameters smoke" -ForegroundColor Yellow
Push-Location '..\frontend'
npm run smoke:parameters -- --base-url $BaseUrl --out "..\tmp\smoke-parameters-report.json"
$smokeExit = $LASTEXITCODE
Pop-Location
if ($smokeExit -ne 0) { Write-Host 'Smoke tests reported failures (see tmp\smoke-parameters-report.json)' -ForegroundColor Red }

# 3. API quick smoke
Write-Host "3) API quick smoke" -ForegroundColor Yellow
try {
  $r = Invoke-WebRequest -Uri "$BaseUrl/api/request/health" -UseBasicParsing -Method GET -TimeoutSec 10 -ErrorAction Stop
  Write-Host "API request health: $($r.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host "API health endpoint not reachable: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 4. Generate simple summary
$reportFile = '..\tmp\smoke-parameters-report.json'
if (Test-Path $reportFile) {
  $rep = Get-Content $reportFile -Raw | ConvertFrom-Json
  $summary = [PSCustomObject]@{
    timestamp=(Get-Date).ToString('o'); smokeStatus=$rep.status; failing=(($rep.checks.PSObject.Properties | Where-Object { -not [bool]$_.Value }) | Select-Object -ExpandProperty Name) -join ', '
  }
  $summary | ConvertTo-Json -Depth 3 | Set-Content -Path '..\tmp\test-summary.json' -Encoding UTF8
  Write-Host "Summary written to ..\tmp\test-summary.json" -ForegroundColor Green
} else {
  Write-Host "Smoke report not found; skipping summary" -ForegroundColor Yellow
}

Pop-Location

if ($smokeExit -ne 0) { exit 1 } else { exit 0 }
