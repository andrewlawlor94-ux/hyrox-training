# Idempotent Windows setup. Keeps node_modules out of OneDrive sync by using a
# directory junction; OneDrive does not sync reparse points.
#
# The target's final path segment must be literally "node_modules" (not e.g.
# "hyrox-node_modules"): Node's module resolution walks up the *realpath* of
# a loaded module looking for an ancestor directory literally named
# "node_modules". A junction whose target folder has a different name
# resolves fine for top-level requires but breaks nested/sibling package
# resolution (observed: vitest's own internal `@vitest/utils` import failed
# to resolve once node_modules was a differently-named real folder).
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$target = 'C:\dev\hyrox\node_modules'
$link = Join-Path $repo 'node_modules'

if (-not (Test-Path $target)) { New-Item -ItemType Directory -Force -Path $target | Out-Null }

$existing = Get-Item -Path $link -Force -ErrorAction SilentlyContinue
if ($existing -and -not $existing.LinkType) {
  Write-Host 'node_modules exists as a real directory. Removing so it can be junctioned.'
  Remove-Item -Recurse -Force $link
  $existing = $null
}
if (-not $existing) {
  New-Item -ItemType Junction -Path $link -Target $target | Out-Null
  Write-Host "Junction created: $link -> $target"
} else {
  Write-Host "Junction already present: $link -> $($existing.Target)"
}
Write-Host 'Setup complete. Run: npm install'
