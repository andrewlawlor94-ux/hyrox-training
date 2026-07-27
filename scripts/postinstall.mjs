// Cross-platform entry point for npm's "postinstall" lifecycle hook.
//
// The actual junction-repair logic lives in PowerShell
// (scripts/postinstall-junction.ps1 -> scripts/node-modules-junction.ps1) and only
// makes sense on Windows, where OneDrive sync and NTFS directory junctions are
// relevant. This wrapper's only job is dispatch — it does not duplicate any of
// that logic:
//   - on any non-Windows platform, do nothing and exit 0 immediately;
//   - on Windows, invoke the PowerShell script, preferring `pwsh` (PowerShell 7+)
//     and falling back to Windows PowerShell (`powershell`);
//   - never let a missing interpreter or a failing script fail `npm install`.
//     This must always exit 0: an unsynced node_modules folder is an
//     inconvenience, but a broken `npm install`/`npm ci` (e.g. in CI on Linux,
//     see Task 31's GitHub Actions workflow) is much worse.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), 'postinstall-junction.ps1')
const INTERPRETERS = ['pwsh', 'powershell']

function runWith(interpreter) {
  return spawnSync(interpreter, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH], {
    stdio: 'inherit',
  })
}

function main() {
  if (process.platform !== 'win32') {
    // No OneDrive-junction concept and no PowerShell to run off Windows.
    return
  }

  for (const interpreter of INTERPRETERS) {
    const result = runWith(interpreter)

    if (result.error) {
      // Interpreter not found (ENOENT) or failed to spawn: try the next one.
      continue
    }

    if (result.status !== 0) {
      console.warn(
        `[postinstall] ${interpreter} exited with status ${String(result.status)} while running ` +
          `${SCRIPT_PATH}. This is non-fatal. If node_modules is not a junction, run: npm run fix-junction`,
      )
    }
    return
  }

  console.warn(
    '[postinstall] Could not find a PowerShell interpreter (tried: pwsh, powershell). ' +
      'Skipping the node_modules junction repair; this is non-fatal. If you are on Windows and ' +
      'node_modules ends up synced into OneDrive, run: npm run fix-junction',
  )
}

try {
  main()
} catch (err) {
  // Belt-and-suspenders: main() is synchronous and every call it makes is
  // already guarded, but a postinstall hook must categorically never throw.
  console.warn(`[postinstall] Unexpected error, continuing (${String(err)}).`)
}

process.exitCode = 0
