# Prerequisite checker for Artemis test-suite
param(
  [string]$BaseUrl = 'http://localhost:9090'
)

Write-Host "Running prereq checks against $BaseUrl" -ForegroundColor Cyan

function Check-Get {
  param($path)
  try {
    $uri = "$BaseUrl$path"
    $r = Invoke-WebRequest -Uri $uri -UseBasicParsing -Method GET -TimeoutSec 10 -ErrorAction Stop
    $ok = $r.StatusCode -eq 200
    return [PSCustomObject]@{path=$path; ok=$ok; status=$r.StatusCode; bodySample=($r.Content | Select-Object -First 1)}
  } catch {
    return [PSCustomObject]@{path=$path; ok=$false; status=$null; error=$_.Exception.Message}
  }
}

$checks = @()
$checks += Check-Get -path '/api/flows'
$checks += Check-Get -path '/api/certificates'
$checks += Check-Get -path '/api/certificate-sets'

$uiCheck = @{path='/'; ok=$false}
try {
  $b = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -Method GET -TimeoutSec 10 -ErrorAction Stop
  $uiCheck.ok = $b.StatusCode -eq 200
  $uiCheck.status = $b.StatusCode
} catch {
  $uiCheck.ok = $false
  $uiCheck.error = $_.Exception.Message
}

$report = [PSCustomObject]@{
  timestamp = (Get-Date).ToString('o')
  baseUrl = $BaseUrl
  checks = $checks
  ui = $uiCheck
}

$reportPath = Resolve-Path '..\tmp\prereq-report.json' -ErrorAction SilentlyContinue 2>$null
if (-not $reportPath) { New-Item -ItemType Directory -Path '..\tmp' -Force | Out-Null }
$reportFile = Join-Path '..\tmp' 'prereq-report.json'
$report | ConvertTo-Json -Depth 5 | Set-Content -Path $reportFile -Encoding UTF8

Write-Host "Prereq report written to $reportFile" -ForegroundColor Green
$report | Format-List

if (($checks | Where-Object { -not $_.ok }).Count -gt 0 -or -not $uiCheck.ok) { exit 1 } else { exit 0 }
