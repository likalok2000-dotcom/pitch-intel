# PitchIntel — deploy to Railway and print public URL
# Prerequisites:
#   1. Node.js
#   2. GitHub repo already pushed (or Railway can deploy from local)
#   3. Browser login once: railway login
#
# Usage:
#   cd C:\Users\paula\pitch-intel
#   .\scripts\deploy-railway.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "==> Ensuring @railway/cli ..." -ForegroundColor Cyan
if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
  npm install -g @railway/cli
}

Write-Host "==> Checking Railway login ..." -ForegroundColor Cyan
railway whoami 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Opening browser for railway login ..." -ForegroundColor Yellow
  railway login
}

Write-Host "==> Init / link project ..." -ForegroundColor Cyan
# Create new project if not linked
if (-not (Test-Path ".railway") -and -not (Test-Path "railway.json")) {
  Write-Host "Creating new Railway project (interactive if needed)..."
  # Non-interactive-ish: railway init may prompt
  railway init
}

Write-Host "==> Deploy ..." -ForegroundColor Cyan
railway up --detach

Write-Host "==> Ensure web service has public domain ..." -ForegroundColor Cyan
railway domain 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Try: railway domain" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==> Status" -ForegroundColor Cyan
railway status 2>$null
railway variables 2>$null

Write-Host ""
Write-Host "Optional secrets (run once):" -ForegroundColor Yellow
Write-Host '  railway variables set DATA_PROVIDER=auto'
Write-Host '  railway variables set API_FOOTBALL_KEY=your_key'
Write-Host '  railway variables set XAI_API_KEY=your_key'
Write-Host ""
Write-Host "Open dashboard: railway open" -ForegroundColor Green
Write-Host "Public URL is under Settings → Networking → Public Domain" -ForegroundColor Green
