# sync-github.ps1 - Commit local changes and push to GitHub main.
# Run via double-click on the sync .cmd file.
# ASCII-only: PowerShell 5 reads .ps1 with the ANSI code page.

$ErrorActionPreference = 'Continue'
$env:GIT_TERMINAL_PROMPT = '0'   # never prompt for credentials (fail fast instead of hanging)
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ''
Write-Host '======== Sync to GitHub ========' -ForegroundColor Cyan

# Ensure git uses gh's login for credentials (self-healing)
$helper = git config --global --get credential.helper 2>$null
if (-not $helper) {
  git config --global credential.helper "!gh auth git-credential" 2>$null
  Write-Host 'Configured git to use gh credentials.' -ForegroundColor Cyan
}

Write-Host '[1/4] Connecting to GitHub (git fetch)...'
git fetch origin
if ($LASTEXITCODE -ne 0) {
  Write-Host 'FAILED: cannot reach GitHub. Check your network.' -ForegroundColor Red
  exit 1
}

if (-not (git rev-parse --verify main 2>$null)) {
  Write-Host '[2/4] First sync: checking out main from GitHub...'
  git checkout -f -B main origin/main
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'FAILED: could not set up local main branch.' -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host '[2/4] Local main branch ready'
}

Write-Host '[3/4] Committing local changes...'
git add -A
$msg = 'update ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')
git commit -m $msg

Write-Host '[4/4] Pushing to GitHub (git push)...'
git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'FAILED: push failed. Copy the error above and send it to me.' -ForegroundColor Red
  Write-Host 'Common fix: run  git pull --rebase origin main  then try again.' -ForegroundColor Yellow
  exit 1
}

Write-Host ''
Write-Host 'DONE: synced to GitHub.' -ForegroundColor Green
Write-Host '  repo: https://github.com/JamStrak/duck-mom-goes-home' -ForegroundColor Green
Write-Host '  site: https://jamstrak.github.io/duck-mom-goes-home/ (updates in ~1 min after push)' -ForegroundColor Green
