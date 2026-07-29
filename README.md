# HYROX Training

A local-only, offline-first Progressive Web App for following and logging a 24-week HYROX
race-training plan. No account, no backend, no analytics — every workout you log stays on
your device.

**Live app:** https://andrewlawlor94-ux.github.io/hyrox-training/

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started (Windows)](#getting-started-windows)
- [Running locally](#running-locally)
- [Testing on an iPhone over Wi-Fi](#testing-on-an-iphone-over-wi-fi)
- [Running the test suite](#running-the-test-suite)
- [Production build](#production-build)
- [Deploying to GitHub Pages](#deploying-to-github-pages)
- [Installing on an iPhone](#installing-on-an-iphone)
- [How local data works](#how-local-data-works)
- [Backups](#backups)
- [Updating the deployed app](#updating-the-deployed-app)
- [Known iOS PWA limitations](#known-ios-pwa-limitations)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

## What it does

The app turns a 24-week HYROX race plan into a day-by-day tracker:

- **Onboarding** anchors the plan to a race date and previews the milestones that fall out
  of that anchor before you commit to anything.
- **Home** shows today's prescribed workout, a summary of the current week, and a snapshot
  of progress toward the race goal.
- **Workout logging** covers strength work (inline target weights/reps/RIR with one-tap set
  entry), runs (with optional interval splits), and HYROX stations, plus a persistent rest
  timer that survives navigation and screen lock.
- **Completion** records one of five outcomes per workout (including partial and skipped)
  and can capture symptoms, which feed substitution suggestions and red-flag safety cards.
- **Progress** charts strength and running trends over the plan.
- **Exercise library** for browsing the movements the plan draws from.
- **Plan editing**, including a full browser across every week of the plan, per-workout
  substitution, and moving a session to a different day.
- **Settings**, including versioned backup/restore and a full local reset.
- The default race goal shipped with the app is **1:35** target / **1:30** stretch — a
  product default, not a prediction; every athlete's own goal is editable from onboarding.

Built with React 19, TypeScript (strict), Vite 7, Dexie 4 over IndexedDB, vite-plugin-pwa,
Recharts, and Vitest + React Testing Library.

## Architecture

Three layers, enforced rather than just documented:

- **Domain layer** (`src/domain/**`) is pure: no I/O, no React, no ambient clock. Every
  function that needs "today" takes it as an argument instead of calling `Date.now()`
  itself. This is enforced two ways — an ESLint rule that blocks domain files from
  importing React, Dexie, or the data/UI layers, and a filesystem-scanning test
  (`src/domain/__tests__/purity.test.ts`) that greps every domain source file for the
  patterns the rule can't catch (`Date.now()`, `new Date()`, `Math.random()`, disallowed
  imports).
- **Data layer** (`src/data/**`) wraps Dexie/IndexedDB: schema, migrations, repositories,
  and an immutability guard over completed history.
- **UI layer** (`src/features/**`, `src/components/**`, `src/hooks/**`) is ordinary React.

The workout schedule itself is **derived, never stored**. There is no "queue" table sitting
around waiting to go stale. The source of truth is the immutable plan definition, plus an
append-only event journal, plus a small set of explicit overrides (moves, substitutions).
The visible schedule is recomputed from those three inputs on demand. That's what makes
backdating a completion or resetting the plan non-destructive — nothing has to be
"un-queued," because nothing was ever queued in the first place.

## Project structure

```
src/
  domain/        pure logic: plan generation, milestones, pace/units math, the
                 schedule-replay engine, backup validation — no I/O
  data/          Dexie schema, migrations, repositories, seed data, backup
                 export/import
  features/      screens and feature-level components (home, plan, progress,
                 workout, settings, backup, onboarding, timer, symptoms, shell)
  components/    small shared UI primitives
  hooks/         shared React hooks
  styles/        global CSS and design tokens
  test/          Vitest setup and stubs shared across the suite
scripts/         Windows setup/postinstall junction scripts, icon generation
.github/
  workflows/
    deploy.yml   GitHub Pages build-and-deploy workflow
vite.config.ts   base path, PWA manifest/service-worker config, SPA 404 fallback
```

## Getting started (Windows)

The repo lives under a OneDrive-synced folder, but `node_modules` cannot: OneDrive does not
sync NTFS reparse points, and `node_modules` here is kept as a **directory junction**
pointing at `C:\dev\hyrox\node_modules`, off OneDrive's radar entirely. Run the setup script
once before installing:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
npm install
```

The setup script creates the junction (or repairs it if it already half-exists as a real
folder). `npm install` itself will happily destroy a fresh junction — npm's installer sees
the reparse point, treats it as "not a directory," and replaces it with a real folder inside
the OneDrive-synced repo — so a `postinstall` hook (`scripts/postinstall.mjs`) re-runs the
same repair automatically after every `npm install`/`npm ci`. That hook is platform-guarded:
it's a no-op on any non-Windows platform, so it never affects CI's `npm ci` on Ubuntu, which
has no OneDrive and no junction concept to worry about.

If the junction ever needs repairing by hand (e.g. after a fresh clone), run:

```powershell
npm run fix-junction
```

## Running locally

```powershell
$env:Path = "$env:ProgramFiles\nodejs;$env:Path"   # only needed if node/npm aren't on PATH
npm run dev
```

Opens at `http://localhost:5173`.

## Testing on an iPhone over Wi-Fi

```powershell
npm run dev:lan
```

Then find this machine's LAN IP:

```powershell
ipconfig
```

Look for the IPv4 address of the network adapter your phone is also on, then open
`http://<that-ip>:5173` in Safari on the phone.

**This works for layout and interaction, but not for installability or offline behaviour.**
Service workers only register on `localhost` or over HTTPS — never over a plain LAN HTTP
address like `http://192.168.1.23:5173`. That means "Add to Home Screen," the offline
cache, and the update-prompt flow all silently fail to engage over LAN Wi-Fi, with no error
shown. To actually verify install and offline behaviour, use the deployed HTTPS URL
(https://andrewlawlor94-ux.github.io/hyrox-training/) on the phone instead — that's the only
way to test the PWA parts of the app from an iPhone short of running a full local HTTPS dev
server.

## Running the test suite

```powershell
npm run test:run
```

928 tests across 81 files (unit, component, and filesystem-scanning tests), run once and
exit. `npm run test` runs the same suite in Vitest's interactive watch mode.

### End-to-end tests

```powershell
npx playwright install chromium   # one-time browser download
npm run e2e
```

Three Playwright specs under `e2e/` drive a real Chromium browser, at a real iPhone 13
viewport, against a real production build (`playwright.config.ts`'s `webServer` runs
`npm run build` then `vite preview` on port 4173, under the same `/hyrox-training/` subpath
the GitHub Pages deploy uses — never the dev server):

- `workoutLogging.spec.ts` — onboarding through a fresh, empty IndexedDB; every exercise
  expanded with no tap required; logging a set with one tap and no field edits, then
  confirming the **database row** (not just the UI) carries the prefilled weight/reps; a
  typed weight and the rest timer's countdown both surviving a real page reload; finishing
  as "Partially completed" and confirming Home never reports it as completed; no horizontal
  scroll at any point.
- `backupRestore.spec.ts` — log a set, export a real downloaded backup file, reset all data
  through the confirmation flow, and restore via onboarding's own pre-onboarding "Restore it
  instead" entry point (the path a fresh phone actually uses) — then confirm the logged set,
  its weight/reps, and the completed instance's `frozen` flag all come back identical.
  A deliberately corrupted file is also imported, asserting both a specific error message and
  that the restored data is untouched.
- `offlineInstall.spec.ts` — the manifest is served with a correct subpath-carrying
  `start_url`/`scope` and every icon resolves; then, fully offline
  (`context.setOffline(true)`), Home still renders from the service worker's cache, tab
  navigation keeps working, and a hard reload on a deep, lazily-loaded route (`/plan`) still
  renders — the `navigateFallback` path a plain `fetch()` can't exercise.

This is deliberately the layer the 928 Vitest/RTL tests cannot reach: a real IndexedDB
starting genuinely empty, a real service worker, and real elapsed wall-clock time — the
combination that has caught every serious defect on this project so far (a blank first
launch from a read-that-writes on an empty database, a one-tap set that logged completion but
not weight/reps, empty Base-week prescriptions, and sub-44px tap targets forcing real
horizontal scroll).

`npm run e2e` is not currently wired into `.github/workflows/deploy.yml` — it would add a
~200MB browser download to the deploy path, which felt like a decision worth a deliberate,
separate choice rather than a silent addition. Recommended if/when CI minutes and cache
strategy for the browser download are worked out.

## Production build

```powershell
npm run build
npm run preview
```

`npm run build` runs `tsc -b` (typecheck) followed by `vite build`. `npm run preview` serves
the built `dist/` folder locally so you can sanity-check the production bundle before
deploying.

## Deploying to GitHub Pages

The recommended (free) deployment target is GitHub Pages, driven by
`.github/workflows/deploy.yml`.

**One-time setup:**

1. Create a public GitHub repository (this project's is `andrewlawlor94-ux/hyrox-training`).
2. Push this repo to it:
   ```powershell
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. That's
   the only manual step — no build configuration to fill in.
4. Push to `main` (or run the workflow manually from the **Actions** tab via
   `workflow_dispatch`). The workflow lints, typechecks, tests, builds, and deploys.

**What the workflow does** (`.github/workflows/deploy.yml`):

- Triggers on push to `main` and on manual `workflow_dispatch`.
- Runs on Node 24, with `npm ci`, `npm run lint`, `npm run typecheck`, and
  `npm run test:run` all gating the build.
- Builds with `VITE_BASE` set to `/${{ github.event.repository.name }}/` — derived from the
  repository's own name rather than hardcoded, so a repository rename keeps working without
  touching this file. This is the single most common way a Pages-hosted PWA breaks: get the
  base path wrong and every asset URL, the service worker's scope, and the web manifest all
  point at the wrong subpath. The manifest 404s, the service worker never registers, and
  iOS's "Add to Home Screen" silently produces a plain bookmark instead of an installed app.
- Uses `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`
  to publish `dist/` — least-privilege permissions (`pages: write`, `id-token: write`), no
  long-lived deployment secret required.
- GitHub Pages serves a static bucket with no server-side rewrite rules, so refreshing a
  deep route (or reopening an installed PWA on one) would ordinarily 404. Pages does serve
  `404.html` for any unmatched path, so `vite.config.ts` copies `dist/index.html` to
  `dist/404.html` byte-for-byte on every build (`spaFallback` plugin), which makes
  client-side routing survive a hard refresh.

## Installing on an iPhone

1. Open the deployed URL in **Safari** (not Chrome — iOS only allows installing PWAs from
   Safari): https://andrewlawlor94-ux.github.io/hyrox-training/
2. Tap the **Share** icon (square with an arrow pointing up) in the toolbar.
3. Scroll down and tap **Add to Home Screen**.
4. Confirm the name and tap **Add**.
5. Launch it from the new home-screen icon — it opens full-screen with no Safari chrome.

## How local data works

Everything is stored in **IndexedDB**, entirely on-device, via Dexie. There is no account,
no login, no server, and nothing is ever sent off the device. That also means there is no
cross-device sync — a workout logged on one device does not appear on another. If storage
persistence isn't granted by the browser (visible in Settings), the OS can evict the data
under storage pressure, particularly on iOS; see the backup section below.

## Backups

Settings includes an export/import flow for the entire local database:

- **Export** downloads a versioned JSON file containing every table the app manages
  (workouts, logs, the plan, settings, and more).
- **Import** validates the file's format and schema version before touching anything. A
  malformed or unrecognised file is rejected outright, with the existing data left
  completely untouched.
- Immediately before an import is applied, the app writes a local **safety backup** of the
  current database, so a bad or unwanted import can be recovered from without needing an
  external file.
- Settings also offers **restore original 24-week plan** (re-seeds the plan while preserving
  completed history) and a full **reset**, which is the one genuinely destructive action in
  the app and requires typing a confirmation phrase.

Because this is local-only storage, exporting a backup periodically is the only way to
protect training history against a lost phone, a reinstall, or iOS reclaiming storage.

## Updating the deployed app

Push to `main` — the workflow rebuilds and redeploys automatically. Updating the deployed
app **never clears IndexedDB**, by design:

- The service worker registers with `registerType: 'prompt'`, not `autoUpdate`. A new
  service worker installs in the background and then **waits** rather than taking over
  immediately, so an update landing mid-workout can't swap the app out from under you.
- When a new version is ready, an in-app prompt appears: *"A new version of the app is
  ready. Your workout history is saved and won't be affected."* Tapping **Update now**
  activates the new worker and reloads; **Later** just dismisses the prompt for the
  session — neither path touches IndexedDB.
- Any database migrations needed by the new version run automatically the next time the app
  opens, against the same IndexedDB data that was already there.

## Known iOS PWA limitations

- **No background timers.** The rest timer stores an absolute end timestamp, so it stays
  numerically accurate across a screen lock or app switch — but iOS gives web apps no way to
  fire an alert while backgrounded, so it cannot notify you that rest is over unless the app
  is in the foreground.
- **No push notifications.** This is a deliberate scope decision, not a missing feature —
  the app has no backend to send them from.
- **Storage is evictable.** iOS can reclaim an installed PWA's storage under space pressure,
  and clearing Safari's site data for the app destroys the local database outright. This is
  exactly why periodic export (see Backups) matters more than it would for a native app.
- **No Apple Health integration.** Workouts logged here do not appear in Health, and Health
  data does not flow in.

## Known limitations

- **Past-record correction is strength-only.** `PastRecordEditor` lets you fix a logged
  strength set (weight/reps/RIR) after the fact. Correcting a past run or station log is not
  built yet — if you mis-logged one of those, the record stands as originally entered.
- **Running volume isn't unit-converted.** The running progress view reports planned volume
  in whatever unit the plan itself prescribes for that session — minutes for
  duration-prescribed runs, kilometres for distance-prescribed ones — rather than converting
  everything to one unit. Converting a planned duration into a distance would mean
  fabricating a pace that was never prescribed, so the app shows the two side by side
  instead of pretending to a precision it doesn't have.
- **The interface is information-dense.** Workout, plan, and progress screens surface a lot
  of numbers at once (targets, prior performance, RIR, splits). That density is a deliberate
  choice for an app used mid-session, but it's under active review — if it reads as
  cluttered, that's a known, not accidental, trade-off.

## Troubleshooting

**`node`/`npm` not recognized right after install.** Restart the shell (or PowerShell/VS
Code window). The Node.js installer updates PATH for new shells, not ones already open.

**`EPERM`/`EBUSY` errors under OneDrive.** Usually the OneDrive sync client briefly holding a
lock on a file it's still syncing, or the `node_modules` junction having been clobbered back
into a real folder by an `npm install`. Re-run the setup script:
```powershell
npm run fix-junction
```

**Intermittent `EBUSY` failures in unrelated test files.** On this machine, real-time
antivirus scanning can transiently lock files under the junctioned `node_modules` mid-test-run,
producing `EBUSY` in files that have nothing to do with whatever changed. A local antivirus
exclusion for `C:\dev\hyrox` clears this up. Either way, treat GitHub Actions CI as the
authoritative gate for whether the suite actually passes — a local `EBUSY` is a local
environment artifact, not a real failure.

**The app is stuck on an old version.** Either use the in-app update prompt (see
[Updating the deployed app](#updating-the-deployed-app)), or force it manually in Safari:
**Settings → Safari → Advanced → Website Data**, find the site, and remove it (this also
deletes local workout history — export a backup first).

**Blank page after deploying to GitHub Pages.** Almost always a wrong `VITE_BASE`. Check that
the deployed page's URL subpath (`/<repo-name>/`) matches what the workflow computed
(`/${{ github.event.repository.name }}/`) — a repository rename without a corresponding
redeploy, or a manual build with the wrong `VITE_BASE` environment variable, are the usual
causes.
