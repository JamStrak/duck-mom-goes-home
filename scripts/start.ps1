param(
  [switch]$ShareLan,
  [switch]$NoBrowser,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
$stateFile = Join-Path $runtimeDir 'server-state.json'
$stdoutLog = Join-Path $runtimeDir 'server.log'
$stderrLog = Join-Path $runtimeDir 'server-error.log'
$port = 5175
$hostName = if ($ShareLan) { '0.0.0.0' } else { '127.0.0.1' }
$appUrl = "http://localhost:$port"
. (Join-Path $PSScriptRoot 'lib\ports.ps1')

function Test-AppReady {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$appUrl/" -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Stop-RecordedServer {
  if (-not (Test-Path -LiteralPath $stateFile)) { return $false }
  try {
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if ($state.projectRoot -ne $projectRoot) { return $false }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.pid)" -ErrorAction SilentlyContinue
    if ($process -and $process.Name -match '^node(\.exe)?$' -and $process.CommandLine -match 'server\.mjs') {
      Stop-Process -Id $state.pid -Force
      Start-Sleep -Milliseconds 500
    }
    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
    return $true
  } catch {
    return $false
  }
}

function Stop-ConflictingGameServer {
  param([int]$Port)
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $listeners) { return $true }

  foreach ($processId in ($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if (-not $process -or $process.Name -notmatch '^node(\.exe)?$' -or $process.CommandLine -notmatch 'server\.mjs') {
      return $false
    }
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { return $true }
    Start-Sleep -Milliseconds 100
  }
  return $false
}

function Show-LanAddresses {
  $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and
      ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[01])\.')
    } |
    Select-Object -ExpandProperty IPAddress -Unique
  if (-not $addresses) {
    $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -ExpandProperty IPAddress -Unique
  }
  Write-Host ''
  Write-Host 'On your phone / iPad (connected to the SAME Wi-Fi), open one of:' -ForegroundColor Cyan
  foreach ($address in $addresses) {
    Write-Host "  http://${address}:$port" -ForegroundColor Green
  }
  Write-Host 'Usually the 192.168.x.x address is your Wi-Fi.' -ForegroundColor Yellow
  Write-Host 'If it cannot connect, allow Private networks in the Windows Firewall prompt.' -ForegroundColor Yellow
}

function Add-FirewallRule {
  param([int]$Port)
  try {
    $rule = Get-NetFirewallRule -DisplayName "Duck Mom Goes Home (Port $Port)" -ErrorAction SilentlyContinue
    if (-not $rule) {
      New-NetFirewallRule -DisplayName "Duck Mom Goes Home (Port $Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
      Write-Host "Added a Windows Firewall rule for port $Port (Private networks)." -ForegroundColor Cyan
    }
  } catch {
    Write-Host "Could not add the firewall rule automatically. If the phone cannot connect, allow port $Port for Private networks in Windows Firewall." -ForegroundColor Yellow
  }
}

Set-Location -LiteralPath $projectRoot
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

if (Test-Path -LiteralPath $stateFile) {
  Stop-RecordedServer | Out-Null
}
$existingListener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existingListener -and -not (Stop-ConflictingGameServer -Port $port)) {
  # Port held by another (non-game) program: don't kill it, fall back to the next free port in the same range.
  $port = Find-FreePort -StartPort $port
  Write-Host "Default port is in use by another program, switched to http://localhost:$port" -ForegroundColor Yellow
}

# Final check before launch; if the port is grabbed at the last moment, fall back once more rather than starting in conflict.
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  $port = Find-FreePort -StartPort ($port + 1)
  Write-Host "Port was grabbed at startup, switched to http://localhost:$port" -ForegroundColor Yellow
}
$appUrl = "http://localhost:$port"

if ($ShareLan) {
  Add-FirewallRule -Port $port
}

# Node runtime
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw 'Node.js was not found. Install Node.js LTS (20+) and retry.'
}
$nodeExe = $nodeCommand.Source

# Dependencies (first launch)
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\vite'))) {
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npmCommand) { throw 'npm was not found. Install Node.js LTS and retry.' }
  Write-Host 'First launch: installing dependencies...' -ForegroundColor Cyan
  & $npmCommand.Source install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the network and retry.' }
}

# Build the latest UI
if (-not $SkipBuild -and (Test-Path -LiteralPath (Join-Path $projectRoot 'src'))) {
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npmCommand) { throw 'The UI needs a rebuild, but npm was not found. Install Node.js LTS and retry.' }
  Write-Host 'Preparing the latest UI...' -ForegroundColor Cyan
  & $npmCommand.Source run build
  if ($LASTEXITCODE -ne 0) { throw 'UI build failed. Review the error above.' }
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) {
  throw 'dist/index.html is missing; the game cannot start.'
}

$env:GAME_HOST = $hostName
$env:GAME_PORT = "$port"
Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue
$serverProcess = Start-Process -FilePath $nodeExe -ArgumentList 'server.mjs' `
  -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

[pscustomobject]@{
  pid = $serverProcess.Id
  host = $hostName
  port = $port
  projectRoot = $projectRoot
  startedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  if (Test-AppReady) { $ready = $true; break }
  if ($serverProcess.HasExited) { break }
  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  $details = if (Test-Path -LiteralPath $stderrLog) { Get-Content -LiteralPath $stderrLog -Tail 20 | Out-String } else { '' }
  Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
  throw "The game failed to start. Log: $stderrLog`n$details"
}

Write-Host "Duck Mom Goes Home started: $appUrl" -ForegroundColor Green
if ($ShareLan) { Show-LanAddresses }
if (-not $NoBrowser) { Start-Process $appUrl }
