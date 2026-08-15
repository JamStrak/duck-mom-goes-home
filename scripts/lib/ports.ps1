# Port utilities: pick a free port for a local service to listen on.
#
# Global convention (user preference):
#   - Each project uses its own dedicated numeric range, NOT common defaults
#     like 3000/8080, to avoid colliding with other local services.
#   - This project (Duck Mom Goes Home) uses 5175 as its base port;
#     on conflict it steps up within the same dedicated range (5176, 5177...).
#
# Reuse Find-FreePort for any tool that needs "double-click launch +
# auto port-conflict fallback": check occupancy first, then fall back to a
# free port instead of erroring.
# NOTE: keep this file ASCII-only (PowerShell 5 reads .ps1 with the ANSI code page).

function Find-FreePort {
  param(
    [Parameter(Mandatory = $true)][int]$StartPort,
    [int]$MaxAttempts = 50
  )
  for ($offset = 0; $offset -lt $MaxAttempts; $offset++) {
    $candidate = $StartPort + $offset
    if (-not (Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue)) {
      return $candidate
    }
  }
  throw "No free port found in $MaxAttempts ports starting from $StartPort. Close some programs using ports and retry."
}
