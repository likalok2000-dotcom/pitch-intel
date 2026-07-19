# PitchIntel — init git, create GitHub repo, push
# Usage (PowerShell):
#   cd C:\Users\paula\pitch-intel
#   .\scripts\setup-and-push.ps1
# Optional:
#   .\scripts\setup-and-push.ps1 -RepoName pitch-intel -Private

param(
  [string]$RepoName = "pitch-intel",
  [switch]$Private
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Need($cmd) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "Missing: $cmd" -ForegroundColor Red
    return $false
  }
  return $true
}

if (-not (Need "git")) { exit 1 }

# Ensure git user (local only if missing)
$n = git config user.name 2>$null
$e = git config user.email 2>$null
if (-not $n) {
  git config user.name "PitchIntel"
  Write-Host "Set local git user.name=PitchIntel (change if you want)"
}
if (-not $e) {
  git config user.email "pitch-intel@localhost"
  Write-Host "Set local git user.email=pitch-intel@localhost (change if you want)"
}

if (-not (Test-Path .git)) {
  git init -b main
  Write-Host "git init -b main"
}

git add -A
$status = git status --porcelain
if ($status) {
  git commit -m "feat: PitchIntel v1.1 — AI analysis, lineups API, i18n, Railway deploy"
  Write-Host "Committed"
} else {
  Write-Host "Nothing new to commit"
}

# GitHub via gh if available
if (Get-Command gh -ErrorAction SilentlyContinue) {
  gh auth status 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Run:  gh auth login" -ForegroundColor Yellow
    Write-Host "Then re-run this script."
    exit 0
  }

  $vis = if ($Private) { "private" } else { "public" }
  $remote = git remote get-url origin 2>$null
  if (-not $remote) {
    Write-Host "Creating GitHub repo $RepoName ($vis)..."
    gh repo create $RepoName --$vis --source=. --remote=origin --push
    Write-Host "Pushed to origin" -ForegroundColor Green
    gh repo view --web
  } else {
    Write-Host "Remote exists: $remote"
    git push -u origin main
    Write-Host "Pushed" -ForegroundColor Green
  }
} else {
  Write-Host ""
  Write-Host "=== GitHub CLI not installed ===" -ForegroundColor Yellow
  Write-Host "Install one of:"
  Write-Host "  winget install GitHub.cli"
  Write-Host "  https://cli.github.com/"
  Write-Host ""
  Write-Host "Then:"
  Write-Host "  gh auth login"
  Write-Host "  .\scripts\setup-and-push.ps1"
  Write-Host ""
  Write-Host "Or create repo manually and:"
  Write-Host "  git remote add origin https://github.com/YOUR_USER/$RepoName.git"
  Write-Host "  git push -u origin main"
}
