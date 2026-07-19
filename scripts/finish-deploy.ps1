# Run AFTER you complete browser login for GitHub and/or Railway.
# Completes: push repo → Railway project → public domain → health check
#
#   cd C:\Users\paula\pitch-intel
#   .\scripts\finish-deploy.ps1

$ErrorActionPreference = "Stop"
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "== PitchIntel finish deploy ==" -ForegroundColor Cyan

# --- GitHub ---
gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "GitHub not logged in. Starting device login..." -ForegroundColor Yellow
  Write-Host "Open https://github.com/login/device and enter the code shown."
  gh auth login --hostname github.com --git-protocol https --web
}
gh auth status
if ($LASTEXITCODE -ne 0) { throw "GitHub login failed" }

$remote = git remote get-url origin 2>$null
if (-not $remote) {
  Write-Host "Creating GitHub repo pitch-intel (public)..."
  gh repo create pitch-intel --public --source=. --remote=origin --push
} else {
  Write-Host "Pushing to $remote"
  git push -u origin main
}
$repo = gh repo view --json url -q .url
Write-Host "GitHub: $repo" -ForegroundColor Green

# --- Railway ---
railway whoami 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Railway not logged in. Starting browserless login..." -ForegroundColor Yellow
  Write-Host "Open the activate URL / enter the code printed next."
  railway login --browserless
}
railway whoami
if ($LASTEXITCODE -ne 0) { throw "Railway login failed" }

# Link or create project
if (-not (Test-Path ".railway")) {
  Write-Host "Creating Railway project..."
  railway init --name pitch-intel 2>$null
  if ($LASTEXITCODE -ne 0) {
    # fallback interactive-ish
    railway init
  }
}

Write-Host "Deploying..."
railway up --detach

Write-Host "Generating domain..."
railway domain 2>$null

Write-Host ""
Write-Host "=== Railway status ===" -ForegroundColor Cyan
railway status
railway domain

Write-Host ""
Write-Host "Set optional vars:" -ForegroundColor Yellow
Write-Host "  railway variables set DATA_PROVIDER=auto"
Write-Host ""
Write-Host "When domain is ready, test:" -ForegroundColor Green
Write-Host "  Invoke-RestMethod https://YOUR_DOMAIN.up.railway.app/api/health"
