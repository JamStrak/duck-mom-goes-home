# deploy-gh-pages.ps1 - Publish dist/ to the gh-pages branch via the GitHub Git Data API.
# Used when git push is blocked (sandbox). Requires dist/ to already be built.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\deploy-gh-pages.ps1

$ErrorActionPreference = 'Stop'
$owner = 'JamStrak'
$repo = 'duck-mom-goes-home'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'

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

if (-not (Test-Path -LiteralPath (Join-Path $dist 'index.html'))) {
  throw 'dist/index.html not found; run npm run build first.'
}

# 1) Enumerate dist files
$files = Get-ChildItem -Path $dist -Recurse -File | Sort-Object FullName
Write-Host "Deploying $($files.Count) files from dist/"

# 2) Blobs
$treeEntries = @()
foreach ($f in $files) {
  $rel = $f.FullName.Substring($dist.Length + 1).Replace('\', '/')
  $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($f.FullName))
  $sha = Invoke-GhApi -Method 'POST' -Endpoint "repos/$owner/$repo/git/blobs" -Body @{ content = $b64; encoding = 'base64' } -Jq '.sha'
  $treeEntries += @{ path = $rel; mode = '100644'; type = 'blob'; sha = $sha }
}

# 3) Tree
$treeSha = Invoke-GhApi -Method 'POST' -Endpoint "repos/$owner/$repo/git/trees" -Body @{ tree = $treeEntries } -Jq '.sha'

# 4) Commit (parent = existing gh-pages head if any)
$parents = @()
try {
  $head = Invoke-GhApi -Method 'GET' -Endpoint "repos/$owner/$repo/git/refs/heads/gh-pages" -Jq '.object.sha'
  if ($head) { $parents = @($head) }
} catch { $parents = @() }

$now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$commitSha = Invoke-GhApi -Method 'POST' -Endpoint "repos/$owner/$repo/git/commits" -Body @{
  message   = 'Deploy site'
  tree      = $treeSha
  parents   = $parents
  author    = @{ name = 'JamStrak'; email = 'JamStrak@users.noreply.github.com'; date = $now }
  committer = @{ name = 'JamStrak'; email = 'JamStrak@users.noreply.github.com'; date = $now }
} -Jq '.sha'

# 5) Create or force-update refs/heads/gh-pages
try {
  Invoke-GhApi -Method 'PATCH' -Endpoint "repos/$owner/$repo/git/refs/heads/gh-pages" -Body @{ sha = $commitSha; force = $true } | Out-Null
} catch {
  Invoke-GhApi -Method 'POST' -Endpoint "repos/$owner/$repo/git/refs" -Body @{ ref = 'refs/heads/gh-pages'; sha = $commitSha } | Out-Null
}

# 6) Ensure Pages source = gh-pages branch (legacy)
Invoke-GhApi -Method 'PUT' -Endpoint "repos/$owner/$repo/pages" -Body @{ build_type = 'legacy'; source = @{ branch = 'gh-pages'; path = '/' } } | Out-Null

Write-Host "gh-pages deployed OK"
