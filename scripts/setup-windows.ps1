# Idempotent Windows setup. Keeps node_modules out of OneDrive sync by using a
# directory junction; OneDrive does not sync reparse points. See
# node-modules-junction.ps1 for the shared logic and rationale (also used by
# npm's postinstall hook, which repairs the junction after `npm install`
# destroys it).
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

. (Join-Path $PSScriptRoot 'node-modules-junction.ps1')
Repair-NodeModulesJunction -RepoRoot $repo

Write-Host 'Setup complete. Run: npm install'
