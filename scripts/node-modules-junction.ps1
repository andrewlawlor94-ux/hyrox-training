# Shared logic for keeping node_modules out of OneDrive sync via an NTFS
# directory junction. OneDrive does not sync reparse points, so relocating
# npm-managed files to C:\dev\hyrox\node_modules and linking to it from the
# repo keeps them off OneDrive's radar.
#
# The target's final path segment must be literally "node_modules" (not e.g.
# "hyrox-node_modules"): Node's module resolution walks up the *realpath* of
# a loaded module looking for an ancestor directory literally named
# "node_modules". A junction whose target folder has a different name
# resolves fine for top-level requires but breaks nested/sibling package
# resolution (observed: vitest's own internal `@vitest/utils` import failed
# to resolve once node_modules was a differently-named real folder).
#
# Used by:
#   - scripts/setup-windows.ps1 (manual, first-time setup; errors surface)
#   - scripts/postinstall-junction.ps1 (npm's "postinstall" hook; best-effort,
#     never fails the install — see that file for why)
#
# `npm install` itself destroys the junction: npm's installer sees the
# reparse point via fs.lstatSync, treats it as "not a directory", and
# deletes + recreates node_modules as a real directory inside the
# OneDrive-synced repo. This function repairs that after the fact.
function Repair-NodeModulesJunction {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [string]$Target = 'C:\dev\hyrox\node_modules',
    [switch]$BestEffort
  )

  $link = Join-Path $RepoRoot 'node_modules'
  $existing = Get-Item -Path $link -Force -ErrorAction SilentlyContinue

  if ($existing -and $existing.LinkType -eq 'Junction') {
    Write-Host "Junction already present: $link -> $($existing.Target)"
    return
  }

  if (-not (Test-Path $Target)) {
    New-Item -ItemType Directory -Force -Path $Target | Out-Null
  }

  if ($existing -and -not $existing.LinkType) {
    Write-Host 'node_modules exists as a real directory. Moving its contents out of OneDrive sync.'
    # /MOVE copies then deletes the source, merging into any existing content
    # already at $Target rather than clobbering it. /E includes subdirs
    # (incl. empty ones); the NJH/NJS/NFL/NDL flags just quiet routine output.
    robocopy $link $Target /MOVE /E /NFL /NDL /NJH /NJS | Out-Null
    $robocopyExit = $LASTEXITCODE
    # Robocopy exit codes 0-7 are all success (a bitmask of what happened,
    # e.g. "some files copied"); 8+ means a real failure.
    if ($robocopyExit -ge 8) {
      if ($BestEffort) {
        Write-Warning "node_modules could not be relocated out of OneDrive sync (robocopy exit $robocopyExit). Run: npm run fix-junction"
        return
      }
      throw "robocopy failed while relocating node_modules to $Target (exit $robocopyExit)"
    }
    if (Test-Path $link) {
      Remove-Item -Recurse -Force $link -ErrorAction SilentlyContinue
    }
    $existing = $null
  }

  if (-not $existing) {
    try {
      New-Item -ItemType Junction -Path $link -Target $Target -ErrorAction Stop | Out-Null
      Write-Host "Junction created: $link -> $Target"
    } catch {
      if ($BestEffort) {
        Write-Warning "Could not create node_modules junction ($_). Run: npm run fix-junction"
        return
      }
      throw
    }
  }
}
