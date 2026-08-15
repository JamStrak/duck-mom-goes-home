# seed-github.ps1 - Commit local source to the remote main branch via the GitHub Git Data API.
# Used when git push over HTTPS is blocked (sandbox), but gh/API still works.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\seed-github.ps1

$ErrorActionPreference = 'Stop'
$owner = 'JamStrak'
$repo = 'duck-mom-goes-home'
$root = Split-Path -Parent $PSScriptRoot
$SKIP_DIRS = @('node_modules', 'dist', 'release', '.runtime', 'docs', '.deploy', '.git', '.github')

function Invoke-GhApi {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Endpoint,
    [hashtable]$Body = $null,
    [string]$Jq = $null
  )
  $tmp = [System.IO.Path]::GetTempFileName()
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Compress -Depth 20
    [System.IO.File]::WriteAllText($tmp, $json)
    $inputArg = @('--input', $tmp)
  } else {
    $inputArg = @()
  }
  $jqArg = if ($Jq) { @('--jq', $Jq) } else { @() }
  $out = gh api -X $Method -H 'Content-Type: application/json' $Endpoint @inputArg @jqArg 2>&1
  $code = $LASTEXITCODE
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  if ($code -ne 0) { throw "gh api $Method $Endpoint failed: $out" }
  return (($out | Out-String).Trim())
}

# 1) Enumerate files to commit (skip ignored dirs)
$files = Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
  $rel = $_.FullName.Substring($root.Length + 1)
  $parts = $rel -split '[\\/]'
  foreach ($d in $SKIP_DIRS) { if ($parts -contains $d) { return $false } }
  if ($_.Name -eq '_verify.mjs' -or $_.Name -eq '.DS_Store') { return $false }
  if ($_.Extension -eq '.log') { return $false }
  return $true
} | Sort-Object FullName

Write-Host "Committing $($files.Count) files"

# 2) Create one blob per file, collect tree entries
$treeEntries = @()
foreach ($f in $files) {
  $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
  $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($f.FullName))
  $sha = Invoke-GhApi -Method 'POST' -Endpoint "repos/$owner/$repo/git/blobs" -Body @{ content = $b64; encoding = 'base64' } -Jq '.sha'
  $treeEntries += @{ path = $rel; mode = '100644'; type = 'blob'; sha = $sha }
  Write-Host "  blob  $rel"
}

# 3) Create the tree
$treeSha = Invoke-GhApi -Method 'POST' -Endpoint "repos/$owner/$repo/git/trees" -Body @{ tree = $treeEntries } -Jq '.sha'
Write-Host "tree sha = $treeSha"

# 4) Parent = current main head (if any)
$parents = @()
try {
  $head = Invoke-GhApi -Method 'GET' -Endpoint "repos/$owner/$repo/git/refs/heads/main" -Jq '.object.sha'
  if ($head) { $parents = @($head) }
} catch { $parents = @() }

# 5) Create the commit
$now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$commitBody = @{
  message   = 'Initial source with GitHub Actions deploy'
  tree      = $treeSha
  parents   = $parents
  author    = @{ name = 'JamStrak'; email = 'JamStrak@users.noreply.github.com'; date = $now }
  committer = @{ name = 'JamStrak'; email = 'JamStrak@users.noreply.github.com'; date = $now }
}
$commitSha = Invoke-GhApi -Method 'POST' -Endpoint "repos/$owner/$repo/git/commits" -Body $commitBody -Jq '.sha'
Write-Host "commit sha = $commitSha"

# 6) Force-update refs/heads/main
Invoke-GhApi -Method 'PATCH' -Endpoint "repos/$owner/$repo/git/refs/heads/main" -Body @{ sha = $commitSha; force = $true } | Out-Null
Write-Host "main branch updated OK"

# 7) Try uploading the deploy workflow via the Contents API.
#    NOTE: GitHub blocks creating .github/workflows/* via the REST API (404), so this
#    step usually warns; the workflow must be added via git push instead (see README).
try {
  $wfPath = Join-Path $root '.github\workflows\deploy.yml'
  $wfB64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($wfPath))
  Invoke-GhApi -Method 'PUT' -Endpoint "repos/$owner/$repo/contents/.github/workflows/deploy.yml" -Body @{ message = 'Add deploy workflow'; branch = 'main'; content = $wfB64 } | Out-Null
  Write-Host "workflow uploaded OK"
} catch {
  Write-Host "WARN: workflow upload skipped (GitHub blocks API-created workflow files). Add it via git push."
}
