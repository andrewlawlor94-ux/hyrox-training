# Runs automatically after `npm install`/`npm ci` via package.json's
# "postinstall" script. npm's installer treats the node_modules junction as
# "not a directory" (fs.lstatSync sees a reparse point) and replaces it with
# a real directory inside the OneDrive-synced repo on every install — this
# repairs that.
#
# Best-effort by design: this must never fail `npm install`. A broken
# junction (node_modules synced into OneDrive) is an inconvenience; a broken
# install is worse. On any problem this prints an actionable warning and
# still exits 0.
$ErrorActionPreference = 'Continue'

try {
  $repo = Split-Path -Parent $PSScriptRoot
  . (Join-Path $PSScriptRoot 'node-modules-junction.ps1')
  Repair-NodeModulesJunction -RepoRoot $repo -BestEffort
} catch {
  Write-Warning "postinstall junction repair failed unexpectedly ($_). Run: npm run fix-junction"
}

exit 0
