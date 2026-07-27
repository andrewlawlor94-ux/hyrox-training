# HYROX Training PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable, offline-first, local-only HYROX training tracker PWA that guides a 24-week Men's Open singles plan, logs strength/run/station work in minimum taps, adapts the schedule when sessions are missed, and tracks strength, running, and symptom trends.

**Architecture:** Three strictly separated layers. A **pure domain layer** (zero I/O, zero React, `today` always injected as a parameter) holds every scheduling, recommendation, symptom, pace, and milestone rule and returns both results and human-readable reason strings. A **data layer** (Dexie 4 over IndexedDB) persists everything through repositories that enforce history immutability. A **UI layer** (React 19 + TypeScript strict) reads reactively via `useLiveQuery` — IndexedDB *is* the store, so no Redux/Zustand and no important state held only in React memory. The workout queue is **derived**, never stored as truth: truth is the immutable plan definition plus an append-only `scheduleEvents` journal plus overrides, so recomputation cannot corrupt history.

**Tech Stack:** React 19, TypeScript 5 (strict), Vite 7, Dexie 4 + dexie-react-hooks, vite-plugin-pwa (Workbox), Recharts 3, Vitest 3 + jsdom + React Testing Library + fake-indexeddb, Playwright (Chromium only), ESLint 9 flat config, sharp (devDependency, icon rasterization only).

**Spec:** `docs/superpowers/specs/2026-07-27-hyrox-training-pwa-design.md` — read it before Task 1. Decisions are referenced below as D1–D16.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node.js v24.18.0 LTS, npm 11.16.0, Git 2.53.0** — verified present. No WSL, Docker, Visual Studio, or VS Code.
- **Repo root:** `C:\Users\AndrewLawlor\OneDrive - Canadian Business Growth Fund\Claude Cowork\HYROX`. Already a Git repo on `main`.
- **OneDrive:** `node_modules` MUST be a directory junction to `C:\dev\hyrox-node_modules` before the first `npm install` (Task 1). Never commit `node_modules`, `dist`, `coverage`, `playwright-report`, `test-results`, `dev-dist`.
- **Shell:** Windows PowerShell 5.1. No `&&`/`||` chaining — use `;` and `if ($?) { }`. No ternary, no `??`, no `?.`. Use `New-Item -ItemType Directory -Force` for mkdir. Never redirect native-exe stderr with `2>&1`.
- **TypeScript strict:** `strict: true`, `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`. Zero `any`. Zero `@ts-ignore`.
- **Purity rule:** nothing in `src/domain/**` may import from `src/data/**`, `src/features/**`, `src/components/**`, or `react`. Nothing in `src/domain/**` may call `Date.now()`, `new Date()` with no argument, or `Math.random()`. `today: ISODate` is always a parameter. Enforced by an ESLint `no-restricted-imports` + `no-restricted-globals` rule and by a test in Task 4.
- **File size:** no source file over ~250 lines. Split by responsibility when approaching it.
- **No magic numbers.** Every threshold, default, and increment is a named exported constant with a comment stating its origin.
- **Units:** loads stored as `{ value, unit }`. Never silently convert. Default `lb` for strength, `kg` for stations (D6). `custom` unit never converts.
- **Immutability:** all writes to `strengthSets`, `runLogs`, `intervalSplits`, `stationLogs`, `symptomLogs`, and terminal `workoutInstances` go through `assertMutable()`. Template or exercise-default edits never touch completed records.
- **Accessibility & mobile:** interactive targets ≥44×44px; every form input `font-size: 16px` minimum; `env(safe-area-inset-*)` respected; no horizontal page scroll; real `<label>` for every input; visible focus rings; status never conveyed by colour alone.
- **Copy rules:** no guilt/streak/punitive language. Symptom guidance always carries "Training-load suggestion, not a medical diagnosis." No HYROX logos, brand graphics, or brand fonts. No false-precision race predictions (D14).
- **No network after install.** No backend, accounts, auth, cloud sync, Apple Health, push notifications, nutrition tracking, body-weight time series, paid services, or proprietary APIs.
- **Commit after every task.** Conventional commit prefixes (`feat:`, `test:`, `chore:`, `docs:`, `fix:`). Every commit message ends with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Verification gates** (Task 33 runs all; individual tasks run the relevant subset):
  `npm run lint` · `npm run typecheck` · `npm run test:run` · `npm run e2e` · `npm run build` — all must pass with zero errors and zero material warnings.

### Named constants registry

Defined once, imported everywhere. Task that creates each is noted.

| Constant | Value | File | Task |
|---|---|---|---|
| `STATION_AND_ROXZONE_BUDGET_SEC` | `2520` (42 min) | `domain/milestones/constants.ts` | 12 |
| `COMPROMISED_PENALTY_SEC_PER_KM` | `45` | `domain/milestones/constants.ts` | 12 |
| `MIN_EFFECTIVE_WEEK_SESSIONS` | `4` | `domain/queue/constants.ts` | 9 |
| `IDEAL_WEEK_SESSIONS` | `6` | `domain/queue/constants.ts` | 9 |
| `ROLLING_WINDOW_DAYS` | `7` | `domain/queue/constants.ts` | 9 |
| `MIN_REST_DAYS_PER_ROLLING_WINDOW` | `1` | `domain/queue/constants.ts` | 9 |
| `SIMULATION_CLEAR_DAYS_AFTER` | `2` | `domain/queue/constants.ts` | 9 |
| `MAX_GENERATED_BASE_WEEKS` | `8` | `domain/planGeneration/constants.ts` | 11 |
| `PLAN_WEEKS_DEFAULT` | `24` | `domain/planGeneration/constants.ts` | 11 |
| `SYMPTOM_GREEN_MAX` | `2` | `domain/symptoms/constants.ts` | 8 |
| `SYMPTOM_CAUTION_MAX` | `4` | `domain/symptoms/constants.ts` | 8 |
| `SYMPTOM_SPIKE_DELTA` | `2` | `domain/symptoms/constants.ts` | 8 |
| `SYMPTOM_PERSISTENCE_COUNT` | `3` | `domain/symptoms/constants.ts` | 8 |
| `SYMPTOM_PERSISTENCE_MIN_SCORE` | `3` | `domain/symptoms/constants.ts` | 8 |
| `SYMPTOM_BASELINE_WINDOW` | `5` | `domain/symptoms/constants.ts` | 8 |
| `SYMPTOM_BASELINE_MIN_SAMPLES` | `3` | `domain/symptoms/constants.ts` | 8 |
| `EPLEY_MAX_REPS` | `12` | `domain/strength/constants.ts` | 6 |
| `ONE_RM_MIN_SESSIONS` | `3` | `domain/strength/constants.ts` | 6 |
| `MIN_RIR_FOR_INCREASE` | `1` | `domain/recommendations/constants.ts` | 7 |
| `KG_PER_LB` | `0.45359237` | `domain/units/constants.ts` | 4 |
| `DEFAULT_INCREMENT_LB` | `5` | `domain/recommendations/constants.ts` | 7 |
| `DEFAULT_DUMBBELL_INCREMENT_LB` | `5` | `domain/recommendations/constants.ts` | 7 |
| `DEFAULT_MACHINE_INCREMENT_LB` | `10` | `domain/recommendations/constants.ts` | 7 |
| `AUTOSAVE_DEBOUNCE_MS` | `250` | `features/workout/constants.ts` | 21 |
| `SCHEMA_VERSION` | `1` | `data/schema.ts` | 13 |
| `BACKUP_FORMAT` | `'hyrox-training-backup'` | `domain/backup/constants.ts` | 17 |

---

## File Structure

| Path | Responsibility |
|---|---|
| `scripts/setup-windows.ps1` | Idempotent OneDrive junction + install |
| `scripts/generate-icons.mjs` | SVG → PNG icon rasterization (sharp) |
| `src/data/types.ts` | Every entity interface + union type. Single source of truth. |
| `src/data/schema.ts` | Dexie table declarations, `SCHEMA_VERSION` |
| `src/data/db.ts` | Dexie instance, guarded `openDb()`, failure classification |
| `src/data/migrations/` | Ordered version chain |
| `src/data/repositories/` | One file per aggregate; all writes guarded |
| `src/data/seed/` | Exercise library, HYROX standards, 24-week plan data |
| `src/domain/units/` | Conversion + display formatting |
| `src/domain/pace/` | Pace + interval split arithmetic |
| `src/domain/strength/` | Epley 1RM, personal bests |
| `src/domain/recommendations/` | Strength target rules (§9) |
| `src/domain/symptoms/` | Levels, flags, substitutions, red flags (§16) |
| `src/domain/queue/` | Recovery matrix, eligibility, recompute, explanations (§15) |
| `src/domain/planGeneration/` | Race-date anchoring, Base weeks, instance materialization |
| `src/domain/milestones/` | Goal-derived targets, milestone evaluators, trajectory (§18) |
| `src/domain/backup/` | Export, validate, import (§20) |
| `src/components/` | Presentational primitives only. No domain imports. |
| `src/features/<area>/` | Screen + its own components + hooks |
| `src/hooks/` | Cross-feature reactive hooks |
| `src/styles/tokens.css` | Design tokens (§6) |

---

# Phase 0 — Foundation

### Task 1: Project scaffold, tooling, and the purity guard

**Files:**
- Create: `scripts/setup-windows.ps1`, `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/test/setup.ts`
- Test: `src/domain/__tests__/purity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: npm scripts `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:run`, `e2e`, `icons`. Path alias `@/` → `src/`.

- [ ] **Step 1: Create the OneDrive junction and install dependencies**

Create `scripts/setup-windows.ps1`:

```powershell
# Idempotent Windows setup. Keeps node_modules out of OneDrive sync by using a
# directory junction; OneDrive does not sync reparse points.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$target = 'C:\dev\hyrox-node_modules'
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
```

Run:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```
Expected: `Junction created: ...\node_modules -> C:\dev\hyrox-node_modules`

- [ ] **Step 2: Scaffold package.json and install**

`package.json`:

```json
{
  "name": "hyrox-training",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "dev:lan": "vite --host",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "e2e": "playwright test",
    "icons": "node scripts/generate-icons.mjs"
  },
  "dependencies": {
    "dexie": "^4.0.11",
    "dexie-react-hooks": "^1.1.7",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.1.5",
    "recharts": "^3.1.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.20.0",
    "@playwright/test": "^1.50.1",
    "@testing-library/dom": "^10.4.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.20.0",
    "eslint-plugin-react-hooks": "^5.1.0",
    "eslint-plugin-react-refresh": "^0.4.19",
    "fake-indexeddb": "^6.0.0",
    "globals": "^15.15.0",
    "jsdom": "^26.0.0",
    "sharp": "^0.33.5",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.24.0",
    "vite": "^7.0.0",
    "vite-plugin-pwa": "^0.21.1",
    "vitest": "^3.0.5"
  }
}
```

Run:
```powershell
npm install
```
Expected: completes with 0 vulnerabilities requiring action. If a listed version has been superseded, install the nearest satisfying version and record the actual versions in the commit message. Do not downgrade React below 19 or Vite below 7.

- [ ] **Step 3: Configure TypeScript strictly**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }],
  "compilerOptions": {}
}
```

`tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["scripts/**/*.mjs", "playwright.config.ts"]
}
```

Note: `tsconfig.json` references `./tsconfig.app.json`, so create that file (not a plain single-file tsconfig).

- [ ] **Step 4: Configure Vite, Vitest, and ESLint with the purity rules**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: process.env['VITE_BASE'] ?? '/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: { provider: 'v8', reportsDirectory: './coverage' },
  },
})
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
```

`eslint.config.js` — the purity guard is the important part:

```js
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { project: ['./tsconfig.app.json'], tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-magic-numbers': ['warn', { ignore: [0, 1, -1, 2, 100], ignoreArrayIndexes: true, enforceConst: true }],
    },
  },
  {
    // Purity guard: the domain layer must stay pure and clock-free.
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react-dom', 'dexie', 'dexie-react-hooks'], message: 'Domain layer must not depend on React or Dexie.' },
          { group: ['@/data/*', '@/features/*', '@/components/*', '@/hooks/*'], message: 'Domain layer may only import from @/domain and @/data/types.' },
        ],
      }],
      'no-restricted-syntax': ['error',
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: 'Domain must receive `today` as a parameter, not read the clock.' },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Domain must receive `today` as a parameter, not read the clock.' },
        { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: 'Domain must stay deterministic.' },
      ],
    },
  },
  { files: ['scripts/**/*.mjs', '*.config.{ts,js}'], languageOptions: { globals: globals.node } },
)
```

Note: `@/data/types` is a type-only module with no runtime imports, so the domain layer importing it is safe. The restricted pattern `@/data/*` blocks it, so domain files import entity types via a re-export barrel `@/domain/types.ts` created in Task 3 instead.

- [ ] **Step 5: Write the failing purity test**

`src/domain/__tests__/purity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue
      out.push(...walk(full))
    } else if (entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('domain layer purity', () => {
  const files = walk(join(process.cwd(), 'src', 'domain'))

  it('finds domain source files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each([
    ['reads the clock via Date.now', /Date\.now\s*\(/],
    ['constructs an ambient Date', /new Date\s*\(\s*\)/],
    ['uses Math.random', /Math\.random\s*\(/],
    ['imports React', /from\s+['"]react['"]/],
    ['imports Dexie', /from\s+['"]dexie/],
    ['imports the data layer', /from\s+['"]@\/data\//],
    ['imports the UI layer', /from\s+['"]@\/(features|components|hooks)\//],
  ])('no domain file %s', (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm run test:run -- src/domain/__tests__/purity.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, scandir '...src\domain'`

- [ ] **Step 7: Create the minimal app shell and a placeholder domain module so the test passes**

`src/domain/units/constants.ts`:

```ts
/** Exact NIST conversion factor. */
export const KG_PER_LB = 0.45359237
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#FFFFFF" />
    <title>HYROX Training</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/App.tsx`:

```tsx
export default function App() {
  return <h1>HYROX Training</h1>
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 8: Run the full gate**

Run: `npm run typecheck`
Expected: no output, exit 0.

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run`
Expected: PASS, 8 tests.

Run: `npm run build`
Expected: `✓ built in ...`, `dist/` produced.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React 19 + TS strict with domain purity guard"
```

---

### Task 2: Design tokens and UI primitives

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/global.css`, `src/components/Card.tsx`, `src/components/Button.tsx`, `src/components/NumberField.tsx`, `src/components/Chip.tsx`, `src/components/StatusPill.tsx`, `src/components/SegmentedControl.tsx`, `src/components/Sheet.tsx`, `src/components/EmptyState.tsx`, `src/components/ErrorBoundary.tsx`, `src/components/ScaleSelector.tsx`, `src/components/index.ts`
- Test: `src/components/__tests__/primitives.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  Card: FC<{ children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }>
  Button: FC<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; size?: 'md' | 'sm' }>
  NumberField: FC<{ label: string; value: number | null; onChange: (v: number | null) => void; unit?: string; step?: number; min?: number; max?: number; id: string; inputMode?: 'decimal' | 'numeric'; hideLabel?: boolean }>
  Chip: FC<{ children: ReactNode; tone?: 'neutral' | 'accent' | 'green' | 'caution' | 'elevated' }>
  StatusPill: FC<{ status: 'ahead' | 'onTrack' | 'slightlyBehind' | 'needsAttention'; children?: ReactNode }>
  SegmentedControl: <T extends string>(p: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) => ReactElement
  Sheet: FC<{ open: boolean; onClose: () => void; title: string; children: ReactNode }>
  EmptyState: FC<{ title: string; description: string; action?: ReactNode }>
  ErrorBoundary: class component, props { children: ReactNode; fallbackTitle?: string }
  ScaleSelector: FC<{ label: string; value: number; onChange: (v: number) => void; max?: number; id: string; describedBy?: string }>  // 0-10 one-tap row
  ```

- [ ] **Step 1: Write the failing primitives test**

`src/components/__tests__/primitives.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button, NumberField, ScaleSelector, SegmentedControl, StatusPill } from '@/components'

describe('Button', () => {
  it('renders an accessible button and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Start</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire when disabled', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick} disabled>Start</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('NumberField', () => {
  it('associates its label with the input', () => {
    render(<NumberField id="w" label="Weight" value={180} onChange={vi.fn()} unit="lb" />)
    expect(screen.getByLabelText(/Weight/)).toHaveValue(180)
  })

  it('emits null when cleared rather than NaN', async () => {
    const onChange = vi.fn()
    render(<NumberField id="w" label="Weight" value={180} onChange={onChange} />)
    await userEvent.clear(screen.getByLabelText(/Weight/))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('emits a parsed number on input', async () => {
    const onChange = vi.fn()
    render(<NumberField id="w" label="Weight" value={null} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText(/Weight/), '185')
    expect(onChange).toHaveBeenLastCalledWith(185)
  })
})

describe('ScaleSelector', () => {
  it('renders 0-10 as radio options and reports the chosen value', async () => {
    const onChange = vi.fn()
    render(<ScaleSelector id="rpe" label="Session RPE" value={0} onChange={onChange} />)
    expect(screen.getAllByRole('radio')).toHaveLength(11)
    await userEvent.click(screen.getByRole('radio', { name: '7' }))
    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('marks the current value as checked', () => {
    render(<ScaleSelector id="rpe" label="Session RPE" value={4} onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: '4' })).toBeChecked()
  })
})

describe('SegmentedControl', () => {
  it('reports the selected option', async () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="View"
        value="strength"
        onChange={onChange}
        options={[{ value: 'strength', label: 'Strength' }, { value: 'running', label: 'Running' }]}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Running' }))
    expect(onChange).toHaveBeenCalledWith('running')
  })
})

describe('StatusPill', () => {
  it('conveys status as text, never colour alone', () => {
    render(<StatusPill status="slightlyBehind" />)
    expect(screen.getByText('Slightly behind')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/components/__tests__/primitives.test.tsx`
Expected: FAIL — cannot resolve `@/components`.

- [ ] **Step 3: Write the tokens**

`src/styles/tokens.css`:

```css
:root {
  --bg: #ffffff;
  --surface: #f7f8fa;
  --surface-2: #f0f2f5;
  --border: #e4e7ec;
  --text: #111827;
  --text-muted: #667085;
  --accent: #2563eb;
  --accent-soft: #eff5ff;
  --green: #15803d;
  --green-soft: #ecfdf3;
  --caution: #b45309;
  --caution-soft: #fffaeb;
  --elevated: #b42318;
  --elevated-soft: #fef3f2;

  --radius-card: 12px;
  --radius-control: 10px;
  --shadow-card: 0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.04);

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* Minimum interactive target and minimum input font size to stop Safari zoom. */
  --tap-min: 44px;
  --input-font-size: 16px;

  --font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;

  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);

  --nav-height: 56px;
  --timer-bar-height: 48px;
}
```

`src/styles/global.css`:

```css
@import './tokens.css';

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  overflow-x: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}

input, select, textarea, button { font-family: inherit; font-size: var(--input-font-size); }

button { min-height: var(--tap-min); min-width: var(--tap-min); cursor: pointer; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

.visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
```

Import `./styles/global.css` at the top of `src/main.tsx`.

- [ ] **Step 4: Implement the primitives**

Write each component as a small focused file. Requirements the tests and Global Constraints pin down:

- `Button` — native `<button type="button">` unless `type` is passed; `min-height: var(--tap-min)`; variants map to token colours; `disabled` sets `aria-disabled` and blocks the handler.
- `NumberField` — `<label htmlFor={id}>` + `<input id={id} type="text" inputMode="decimal">`. Uses `type="text"` with `inputMode`, not `type="number"`, so clearing yields `''` not a browser-coerced value and no spinner appears on iOS. `onChange` parses with `Number.parseFloat`; emits `null` for empty or non-finite input, never `NaN`. `unit` renders as a muted suffix inside the field. `hideLabel` applies `.visually-hidden` to the label — the label still exists for screen readers.
- `ScaleSelector` — a `<fieldset>` with `<legend>`, containing 11 `<input type="radio">` + `<label>` pairs (0–10), each label ≥44×44px, laid out in a single horizontal flex row that wraps only below 360px.
- `SegmentedControl` — same radio-group pattern, generic over `T extends string`.
- `Chip` / `StatusPill` — `StatusPill` maps status → `{ label, tone }` with labels exactly `Ahead`, `On track`, `Slightly behind`, `Needs attention`, and renders both a tone colour and the text.
- `Sheet` — `<dialog>`-like overlay: renders `null` when closed; when open, traps focus, closes on Escape and on backdrop click, has `role="dialog" aria-modal="true" aria-label={title}`, and is padded for `--safe-bottom`.
- `EmptyState` — heading + description + optional action slot.
- `ErrorBoundary` — class component with `componentDidCatch`; fallback renders the caught message, a Reload button, and the `fallbackTitle`.
- `src/components/index.ts` re-exports all of them.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:run -- src/components/__tests__/primitives.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add design tokens and accessible UI primitives"
```

---

### Task 3: Entity types

**Files:**
- Create: `src/data/types.ts`, `src/domain/types.ts`
- Test: `src/domain/__tests__/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every entity interface and union type used by every later task. `src/domain/types.ts` re-exports from `src/data/types.ts` so domain files satisfy the ESLint import restriction (Task 1 Step 4 note).

- [ ] **Step 1: Write the union types and entity interfaces**

`src/data/types.ts` — the single source of truth. Content:

```ts
/** ISO calendar date, 'YYYY-MM-DD'. Never a timestamp. */
export type ISODate = string
/** ISO 8601 instant with timezone, e.g. '2026-07-27T14:03:00.000Z'. */
export type ISOInstant = string

export type Unit = 'lb' | 'kg' | 'custom'
export type LoadStyle =
  | 'totalBarbell' | 'perDumbbell' | 'machineStack'
  | 'bodyWeight' | 'bodyWeightPlusLoad' | 'custom'
export type MeasurementType =
  | 'strengthSets' | 'reps' | 'duration' | 'distance'
  | 'pace' | 'timedStation' | 'carry' | 'mixedStation'
export type ExerciseCategory =
  | 'squat' | 'hinge' | 'lunge' | 'press' | 'pull' | 'core' | 'carry'
  | 'sled' | 'erg' | 'plyo' | 'run' | 'wallBall' | 'calf' | 'accessory'
export type Priority = 'essential' | 'important' | 'optional'
export type WorkoutStatus =
  | 'upcoming' | 'available' | 'inProgress' | 'completed'
  | 'partiallyCompleted' | 'deferred' | 'skipped' | 'autoDropped'
export type RecoveryTag =
  | 'hardRun' | 'easyRun' | 'longRun' | 'lowerBodyStrength' | 'upperBodyStrength'
  | 'hybrid' | 'highImpactStation' | 'lowImpactAerobic' | 'recovery' | 'raceSimulation'
export type WorkoutKind =
  | 'strength' | 'run' | 'zone2' | 'hybrid' | 'simulation' | 'race' | 'recovery'
export type Station =
  | 'skiErg' | 'sledPush' | 'sledPull' | 'burpeeBroadJump'
  | 'row' | 'farmerCarry' | 'sandbagLunge' | 'wallBalls'
export type RunType =
  | 'easy' | 'long' | 'tempo' | 'intervals' | 'compromised' | 'benchmark' | 'race'
export type Surface = 'track' | 'treadmill' | 'road' | 'other'
export type SplitKind = 'warmup' | 'work' | 'recovery' | 'cooldown'
export type SymptomLevel = 'green' | 'caution' | 'elevated'
export type SymptomStream = 'shin' | 'sciatic'
export type Trajectory = 'ahead' | 'onTrack' | 'slightlyBehind' | 'needsAttention'
export type RecommendationMode =
  | 'default' | 'increase' | 'optionalIncrease' | 'repeat' | 'symptomHold'
export type PaceSource = 'goalRacePace' | 'manual'
export type EditScope = 'thisWorkout' | 'thisAndFuture' | 'exerciseDefaultOnly'
export type ScheduleEventType =
  | 'COMPLETE' | 'COMPLETE_EARLIER' | 'PARTIAL' | 'DEFER' | 'SKIP'
  | 'MOVE' | 'RESET_RECOMMENDATIONS' | 'PLAN_EDIT' | 'RACE_DATE_CHANGE'
export type MilestoneKey =
  | 'fourWorkoutWeeks' | 'weeklyRunDistance' | 'longestContinuousRun' | 'comfortable10k'
  | 'standalone5k' | 'compromisedKmSet' | 'raceLoadSled' | 'hundredWallBalls'
  | 'halfSimulation' | 'seventyFiveSimulation' | 'fullRehearsal' | 'symptomsManageable'
export type MilestoneStatus = 'notStarted' | 'inProgress' | 'achieved' | 'atRisk'

export interface Load { value: number; unit: Unit; customUnitLabel?: string }
```

Then every entity interface, matching the spec's §3 table exactly. Each entity gets `id: string`. Write them in this order so forward references resolve: `AppSettings`, `AthleteProfile`, `RaceGoal`, `Exercise`, `HyroxStandard`, `Plan`, `PlanPhase`, `PlanWeek`, `WorkoutTemplate`, `Prescription`, `WorkoutInstance`, `InstancePrescription`, `StrengthSet`, `RunLog`, `IntervalSplit`, `StationLog`, `SymptomLog`, `ScheduleEvent`, `ScheduleOverride`, `QueueExplanation`, `RestTimerState`, `MilestoneRecord`, `SafetyBackup`.

Required fields, verbatim from the spec §3 code block. Notes that matter:
- `Exercise.progressionIncrement: number` and `Exercise.incrementUnit: Unit`.
- `Exercise.isSeeded: boolean` — distinguishes shipped library entries from user-created ones so "restore original plan" can be safe.
- `Prescription.paceSource?: PaceSource` and `Prescription.targetPaceSecPerKm?: number` (D15 / §8).
- `Prescription.intervalSpec?: IntervalSpec` where
  ```ts
  export interface IntervalSpec {
    warmupSec?: number
    reps: number
    workSec?: number
    workDistanceM?: number
    recoverySec: number
    cooldownSec?: number
  }
  ```
- `WorkoutInstance.frozen: boolean`, `isManualOverride: boolean`, `plannedDate: ISODate`, `scheduledDate: ISODate`, `completedForDate?: ISODate`.
- `InstancePrescription` extends the same shape as `Prescription` plus `instanceId: string` and `sourcePrescriptionId?: string`.
- `StrengthSet` uses `weight?: number`, `unit?: Unit`, `reps?: number`, `rir?: number`, `isCompleted: boolean`, `isWarmup: boolean`.
- `SymptomLog` has `sessionRpe: number`, `shinPain: number`, `sciaticPain: number`, `forDate: ISODate`.
- `ScheduleEvent` has `at: ISOInstant`, `type: ScheduleEventType`, `instanceId?: string`, `payload: Record<string, string | number | boolean | null>`.
- `RestTimerState` has `id: 'active'`, `endsAt?: ISOInstant`, `pausedRemainingSec?: number`, `isPaused: boolean`, `totalSec: number`.

`src/domain/types.ts`:

```ts
// Re-export barrel so the domain layer can use entity types without importing
// from @/data/* (blocked by the purity ESLint rule). Types only, no runtime code.
export type * from '@/data/types'
```

- [ ] **Step 2: Write the test that the barrel exposes what the domain needs**

`src/domain/__tests__/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('domain type barrel', () => {
  const barrel = readFileSync(join(process.cwd(), 'src', 'domain', 'types.ts'), 'utf8')

  it('re-exports the data entity types', () => {
    expect(barrel).toMatch(/export type \* from '@\/data\/types'/)
  })

  it('contains no runtime imports', () => {
    expect(barrel).not.toMatch(/^import (?!type)/m)
  })
})

describe('entity types compile against representative values', () => {
  it('accepts a fully populated strength set', async () => {
    const { KG_PER_LB } = await import('@/domain/units/constants')
    expect(KG_PER_LB).toBeCloseTo(0.45359237, 8)
  })
})
```

Additionally write `src/data/__tests__/types.typecheck.ts` containing compile-time assertions (no test runner needed — `npm run typecheck` is the gate):

```ts
import type { Exercise, Prescription, StrengthSet, WorkoutInstance } from '@/data/types'

// These object literals must compile. If a required field is missing from the
// interface or misnamed, `npm run typecheck` fails.
export const exercise: Exercise = {
  id: 'ex_back_squat', name: 'Back squat', category: 'squat',
  measurementType: 'strengthSets', loadStyle: 'totalBarbell', defaultUnit: 'lb',
  defaultRestSec: 150, progressionIncrement: 5, incrementUnit: 'lb',
  defaultSets: 4, repMin: 4, repMax: 6, techniqueNotes: '',
  isArchived: false, isSeeded: true,
  createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
}

export const prescription: Prescription = {
  id: 'rx_1', templateId: 'tpl_1', exerciseId: 'ex_back_squat', order: 0,
  sets: 4, repMin: 4, repMax: 6, targetLoad: 175, loadUnit: 'lb',
  loadStyle: 'totalBarbell', restSec: 150,
}

export const set: StrengthSet = {
  id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'irx_1',
  exerciseId: 'ex_back_squat', setIndex: 0, weight: 175, unit: 'lb', reps: 5,
  rir: 2, isCompleted: true, completedAt: '2026-07-27T10:00:00.000Z', isWarmup: false,
}

export const instance: WorkoutInstance = {
  id: 'wi_1', planId: 'plan_1', templateId: 'tpl_1', weekNumber: 1, sessionSlot: 1,
  plannedDate: '2026-08-03', scheduledDate: '2026-08-03', sequence: 0,
  priority: 'essential', recoveryTags: ['lowerBodyStrength'], status: 'upcoming',
  isManualOverride: false, frozen: false,
}
```

- [ ] **Step 3: Run the gate**

Run: `npm run typecheck`
Expected: exit 0. Any missing or misnamed field surfaces here.

Run: `npm run test:run -- src/domain/__tests__/types.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: define entity types and domain type barrel"
```

---

# Phase 1 — Pure domain logic

Every task in this phase is pure TDD: write the test, watch it fail, implement, watch it pass, commit. No mocks, no database, no fake timers — `today` is a parameter.

### Task 4: Units — conversion and display

**Files:**
- Create: `src/domain/units/convert.ts`, `src/domain/units/format.ts`
- Modify: `src/domain/units/constants.ts`
- Test: `src/domain/units/__tests__/convert.test.ts`, `src/domain/units/__tests__/format.test.ts`

**Interfaces:**
- Consumes: `Load`, `Unit` from `@/domain/types`.
- Produces:
  ```ts
  lbToKg(lb: number): number
  kgToLb(kg: number): number
  convertLoad(load: Load, to: Unit): Load          // returns load unchanged if unit === 'custom' or to === load.unit
  formatLoad(load: Load, opts?: { decimals?: number }): string        // '175 lb' | '24 kg' | '3 bands'
  formatWithEquivalent(load: Load): string          // '152 kg · ~335 lb'  (muted half handled by UI)
  formatDuration(totalSec: number): string          // '1:30' | '12:05' | '1:02:30'
  formatPace(secPerKm: number | null): string       // '6:20/km' | '—'
  formatDistanceM(m: number): string                // '50 m' | '1 km' | '1.5 km'
  formatRaceTime(totalSec: number): string          // '1:35:00'
  parseRaceTime(text: string): number | null        // '1:35' -> 5700, '1:35:00' -> 5700, junk -> null
  ```

- [ ] **Step 1: Write the failing conversion test**

`src/domain/units/__tests__/convert.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { convertLoad, kgToLb, lbToKg } from '../convert'

describe('lbToKg / kgToLb', () => {
  it('converts pounds to kilograms', () => {
    expect(lbToKg(100)).toBeCloseTo(45.359237, 6)
  })

  it('converts kilograms to pounds', () => {
    expect(kgToLb(24)).toBeCloseTo(52.9109, 3)
  })

  it('round-trips without drift beyond float precision', () => {
    expect(kgToLb(lbToKg(175))).toBeCloseTo(175, 9)
  })

  it('handles zero', () => {
    expect(lbToKg(0)).toBe(0)
    expect(kgToLb(0)).toBe(0)
  })
})

describe('convertLoad', () => {
  it('converts lb to kg', () => {
    expect(convertLoad({ value: 100, unit: 'lb' }, 'kg')).toEqual({ value: 45.359237, unit: 'kg' })
  })

  it('returns the same load when the unit already matches', () => {
    const load = { value: 175, unit: 'lb' } as const
    expect(convertLoad(load, 'lb')).toEqual(load)
  })

  it('never converts a custom unit', () => {
    const load = { value: 3, unit: 'custom', customUnitLabel: 'bands' } as const
    expect(convertLoad(load, 'kg')).toEqual(load)
  })

  it('never converts TO a custom unit', () => {
    const load = { value: 175, unit: 'lb' } as const
    expect(convertLoad(load, 'custom')).toEqual(load)
  })
})
```

- [ ] **Step 2: Write the failing format test**

`src/domain/units/__tests__/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  formatDistanceM, formatDuration, formatLoad, formatPace,
  formatRaceTime, formatWithEquivalent, parseRaceTime,
} from '../format'

describe('formatLoad', () => {
  it.each([
    [{ value: 175, unit: 'lb' as const }, '175 lb'],
    [{ value: 24, unit: 'kg' as const }, '24 kg'],
    [{ value: 22.5, unit: 'kg' as const }, '22.5 kg'],
    [{ value: 3, unit: 'custom' as const, customUnitLabel: 'bands' }, '3 bands'],
  ])('formats %o as %s', (load, expected) => {
    expect(formatLoad(load)).toBe(expected)
  })

  it('drops a trailing .0', () => {
    expect(formatLoad({ value: 175.0, unit: 'lb' })).toBe('175 lb')
  })
})

describe('formatWithEquivalent', () => {
  it('shows the pound equivalent of a kilogram load', () => {
    expect(formatWithEquivalent({ value: 152, unit: 'kg' })).toBe('152 kg · ~335 lb')
  })

  it('shows the kilogram equivalent of a pound load', () => {
    expect(formatWithEquivalent({ value: 175, unit: 'lb' })).toBe('175 lb · ~79 kg')
  })

  it('shows no equivalent for a custom unit', () => {
    expect(formatWithEquivalent({ value: 3, unit: 'custom', customUnitLabel: 'bands' })).toBe('3 bands')
  })
})

describe('formatDuration', () => {
  it.each([
    [90, '1:30'],
    [725, '12:05'],
    [3750, '1:02:30'],
    [0, '0:00'],
    [5, '0:05'],
  ])('formats %i seconds as %s', (sec, expected) => {
    expect(formatDuration(sec)).toBe(expected)
  })
})

describe('formatPace', () => {
  it('formats seconds per km', () => {
    expect(formatPace(380)).toBe('6:20/km')
  })

  it('renders an em dash for null rather than NaN or Infinity', () => {
    expect(formatPace(null)).toBe('—')
  })
})

describe('formatDistanceM', () => {
  it.each([[50, '50 m'], [1000, '1 km'], [1500, '1.5 km'], [12500, '12.5 km'], [0, '0 m']])(
    'formats %i m as %s', (m, expected) => { expect(formatDistanceM(m)).toBe(expected) },
  )
})

describe('race time', () => {
  it('formats a target time', () => {
    expect(formatRaceTime(5700)).toBe('1:35:00')
  })

  it.each([['1:35', 5700], ['1:35:00', 5700], ['1:29:30', 5370], ['95:00', 5700]])(
    'parses %s to %i seconds', (text, expected) => { expect(parseRaceTime(text)).toBe(expected) },
  )

  it.each(['', 'abc', '1:2:3:4', '-1:00'])('rejects %s', (text) => {
    expect(parseRaceTime(text)).toBeNull()
  })
})
```

Note on `parseRaceTime('95:00')`: two-part input is interpreted as `MM:SS` **unless** the minute count exceeds 59, in which case it is read as `H:MM`. `'1:35'` → 1 h 35 m; `'95:00'` → 95 min = 5700 s. Document this rule in a comment.

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm run test:run -- src/domain/units`
Expected: FAIL — cannot resolve `../convert` and `../format`.

- [ ] **Step 4: Implement conversion**

`src/domain/units/convert.ts`:

```ts
import type { Load, Unit } from '@/domain/types'
import { KG_PER_LB } from './constants'

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

/**
 * Converts a load between lb and kg. A `custom` unit is opaque and never
 * converted in either direction — the caller's value is returned untouched.
 */
export function convertLoad(load: Load, to: Unit): Load {
  if (load.unit === to || load.unit === 'custom' || to === 'custom') return load
  const value = to === 'kg' ? lbToKg(load.value) : kgToLb(load.value)
  return { ...load, value, unit: to }
}
```

- [ ] **Step 5: Implement formatting**

`src/domain/units/format.ts` — implement each function to satisfy the tests. Rules:
- `formatLoad` trims trailing zeros via `Number.parseFloat(value.toFixed(decimals ?? 1)).toString()`; `custom` uses `customUnitLabel`, falling back to the literal `'units'` when absent.
- `formatWithEquivalent` rounds the equivalent to a whole number and prefixes `~`; returns `formatLoad(load)` alone for `custom`.
- `formatDuration` omits the hour component when `totalSec < 3600`; pads minutes only when hours are present; always pads seconds to two digits.
- `formatPace` returns the em dash `'—'` (U+2014) for `null`.
- `formatDistanceM` uses metres below 1000 and kilometres at or above, trimming a trailing `.0`.
- `parseRaceTime` accepts `H:MM:SS`, `H:MM`, and `MM:SS`; rejects empty, non-numeric, negative, and more than three parts; returns whole seconds.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:run -- src/domain/units`
Expected: PASS, 30 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add unit conversion and display formatting"
```

---

### Task 5: Pace and interval split arithmetic

**Files:**
- Create: `src/domain/pace/pace.ts`, `src/domain/pace/intervals.ts`
- Test: `src/domain/pace/__tests__/pace.test.ts`, `src/domain/pace/__tests__/intervals.test.ts`

**Interfaces:**
- Consumes: `IntervalSplit`, `SplitKind` from `@/domain/types`.
- Produces:
  ```ts
  paceSecPerKm(distanceKm: number, durationSec: number): number | null
  speedKmh(distanceKm: number, durationSec: number): number | null
  projectedTimeSec(distanceKm: number, paceSecPerKm: number): number | null

  interface SplitSummary {
    workCount: number
    totalWorkDistanceM: number
    totalSessionDistanceM: number
    totalWorkDurationSec: number
    meanWorkPaceSecPerKm: number | null
    fastestWorkPaceSecPerKm: number | null
    slowestWorkPaceSecPerKm: number | null
  }
  summarizeSplits(splits: Pick<IntervalSplit, 'kind' | 'distanceM' | 'durationSec'>[]): SplitSummary
  splitPaceSecPerKm(split: Pick<IntervalSplit, 'distanceM' | 'durationSec'>): number | null
  ```

- [ ] **Step 1: Write the failing pace test**

`src/domain/pace/__tests__/pace.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { paceSecPerKm, projectedTimeSec, speedKmh } from '../pace'

describe('paceSecPerKm', () => {
  it('computes pace for a valid run', () => {
    expect(paceSecPerKm(5, 1900)).toBe(380) // 31:40 over 5 km = 6:20/km
  })

  it('handles a fractional distance', () => {
    expect(paceSecPerKm(1.5, 570)).toBe(380)
  })

  it.each([
    ['zero distance', 0, 1900],
    ['negative distance', -5, 1900],
    ['zero duration', 5, 0],
    ['negative duration', 5, -100],
    ['NaN distance', Number.NaN, 1900],
    ['Infinity distance', Number.POSITIVE_INFINITY, 1900],
    ['NaN duration', 5, Number.NaN],
    ['Infinity duration', 5, Number.POSITIVE_INFINITY],
  ])('returns null for %s', (_label, km, sec) => {
    expect(paceSecPerKm(km, sec)).toBeNull()
  })

  it('never returns NaN or Infinity', () => {
    for (const [km, sec] of [[0, 0], [Number.NaN, Number.NaN], [1, Number.POSITIVE_INFINITY]] as const) {
      const result = paceSecPerKm(km, sec)
      expect(result === null || Number.isFinite(result)).toBe(true)
    }
  })
})

describe('speedKmh', () => {
  it('computes speed', () => {
    expect(speedKmh(10, 3600)).toBeCloseTo(10, 6)
  })

  it('returns null for invalid input', () => {
    expect(speedKmh(0, 3600)).toBeNull()
  })
})

describe('projectedTimeSec', () => {
  it('projects a finishing time from pace', () => {
    expect(projectedTimeSec(8, 398)).toBe(3184)
  })

  it('returns null for a non-positive pace', () => {
    expect(projectedTimeSec(8, 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Write the failing interval test**

`src/domain/pace/__tests__/intervals.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { splitPaceSecPerKm, summarizeSplits } from '../intervals'

const splits = [
  { kind: 'warmup' as const, durationSec: 600, distanceM: 1500 },
  { kind: 'work' as const, durationSec: 240, distanceM: 1000 },
  { kind: 'recovery' as const, durationSec: 120, distanceM: 300 },
  { kind: 'work' as const, durationSec: 250, distanceM: 1000 },
  { kind: 'recovery' as const, durationSec: 120, distanceM: 300 },
  { kind: 'work' as const, durationSec: 236, distanceM: 1000 },
  { kind: 'cooldown' as const, durationSec: 480, distanceM: 1200 },
]

describe('summarizeSplits', () => {
  const s = summarizeSplits(splits)

  it('counts only work reps', () => {
    expect(s.workCount).toBe(3)
  })

  it('sums work distance only', () => {
    expect(s.totalWorkDistanceM).toBe(3000)
  })

  it('sums total session distance across every kind', () => {
    expect(s.totalSessionDistanceM).toBe(6300)
  })

  it('sums work duration only', () => {
    expect(s.totalWorkDurationSec).toBe(726)
  })

  it('computes mean work pace from work splits only', () => {
    expect(s.meanWorkPaceSecPerKm).toBe(242) // 726 s over 3 km
  })

  it('reports fastest and slowest work pace', () => {
    expect(s.fastestWorkPaceSecPerKm).toBe(236)
    expect(s.slowestWorkPaceSecPerKm).toBe(250)
  })

  it('returns a zeroed summary with null paces for no splits', () => {
    expect(summarizeSplits([])).toEqual({
      workCount: 0, totalWorkDistanceM: 0, totalSessionDistanceM: 0,
      totalWorkDurationSec: 0, meanWorkPaceSecPerKm: null,
      fastestWorkPaceSecPerKm: null, slowestWorkPaceSecPerKm: null,
    })
  })

  it('ignores splits missing distance when computing pace but still counts them', () => {
    const s2 = summarizeSplits([
      { kind: 'work', durationSec: 240, distanceM: 1000 },
      { kind: 'work', durationSec: 120 },
    ])
    expect(s2.workCount).toBe(2)
    expect(s2.totalWorkDistanceM).toBe(1000)
    expect(s2.meanWorkPaceSecPerKm).toBe(240)
  })

  it('returns a null mean when no work split has both distance and duration', () => {
    expect(summarizeSplits([{ kind: 'work', durationSec: 120 }]).meanWorkPaceSecPerKm).toBeNull()
  })
})

describe('splitPaceSecPerKm', () => {
  it('computes a single split pace', () => {
    expect(splitPaceSecPerKm({ distanceM: 1000, durationSec: 380 })).toBe(380)
  })

  it('returns null when distance is missing', () => {
    expect(splitPaceSecPerKm({ durationSec: 380 })).toBeNull()
  })

  it('returns null when duration is missing', () => {
    expect(splitPaceSecPerKm({ distanceM: 1000 })).toBeNull()
  })
})
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm run test:run -- src/domain/pace`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement pace**

`src/domain/pace/pace.ts`:

```ts
const SEC_PER_HOUR = 3600

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0
}

/**
 * Seconds per kilometre. Returns null — never NaN or Infinity — for any
 * non-positive or non-finite input, so callers can render a placeholder.
 */
export function paceSecPerKm(distanceKm: number, durationSec: number): number | null {
  if (!isPositiveFinite(distanceKm) || !isPositiveFinite(durationSec)) return null
  return durationSec / distanceKm
}

export function speedKmh(distanceKm: number, durationSec: number): number | null {
  if (!isPositiveFinite(distanceKm) || !isPositiveFinite(durationSec)) return null
  return (distanceKm / durationSec) * SEC_PER_HOUR
}

export function projectedTimeSec(distanceKm: number, paceSecPerKmValue: number): number | null {
  if (!isPositiveFinite(distanceKm) || !isPositiveFinite(paceSecPerKmValue)) return null
  return distanceKm * paceSecPerKmValue
}
```

- [ ] **Step 5: Implement interval summarization**

`src/domain/pace/intervals.ts` — uses `paceSecPerKm` from `./pace`. Rules pinned by the tests:
- `workCount` counts splits with `kind === 'work'`, including those missing distance.
- `totalWorkDistanceM` / `totalWorkDurationSec` sum only present values on work splits.
- `totalSessionDistanceM` sums every kind.
- `meanWorkPaceSecPerKm` divides *summed work duration of splits having both fields* by *summed work distance of those same splits* — not an average of per-split paces, which would misweight unequal reps. Returns `null` when no work split has both.
- `fastest`/`slowest` derive from per-split paces of splits having both fields; `null` when none do.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:run -- src/domain/pace`
Expected: PASS, 22 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add safe pace and interval split arithmetic"
```

---

### Task 6: Estimated 1RM and personal bests

**Files:**
- Create: `src/domain/strength/constants.ts`, `src/domain/strength/oneRepMax.ts`, `src/domain/strength/personalBests.ts`
- Test: `src/domain/strength/__tests__/oneRepMax.test.ts`, `src/domain/strength/__tests__/personalBests.test.ts`

**Interfaces:**
- Consumes: `ISODate`, `Unit` from `@/domain/types`.
- Produces:
  ```ts
  const EPLEY_MAX_REPS = 12
  const ONE_RM_MIN_SESSIONS = 3

  interface SetPerformance { weight: number; reps: number; unit: Unit; rir?: number }
  interface SessionPerformance { date: ISODate; sets: SetPerformance[] }

  epley1RM(weight: number, reps: number): number | null
  sessionBest1RM(session: SessionPerformance): number | null
  oneRepMaxTrend(sessions: SessionPerformance[]): { date: ISODate; estimated1RM: number }[]
  hasEnough1RMData(sessions: SessionPerformance[]): boolean

  interface PersonalBests {
    heaviestSet: { weight: number; reps: number; unit: Unit; date: ISODate } | null
    bestEstimated1RM: { value: number; unit: Unit; date: ISODate } | null
    mostRepsAtOrAbove: (weight: number) => { reps: number; date: ISODate } | null
    bestVolumeSession: { volume: number; unit: Unit; date: ISODate } | null
  }
  computePersonalBests(sessions: SessionPerformance[]): PersonalBests
  ```

- [ ] **Step 1: Write the failing 1RM test**

`src/domain/strength/__tests__/oneRepMax.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { SessionPerformance } from '../oneRepMax'
import { epley1RM, hasEnough1RMData, oneRepMaxTrend, sessionBest1RM } from '../oneRepMax'

describe('epley1RM', () => {
  it('returns the weight itself for a single rep', () => {
    expect(epley1RM(220, 1)).toBeCloseTo(220 * (1 + 1 / 30), 6)
  })

  it('estimates from a triple', () => {
    expect(epley1RM(220, 3)).toBeCloseTo(242, 0)
  })

  it('estimates from a set of five', () => {
    expect(epley1RM(175, 5)).toBeCloseTo(204.17, 2)
  })

  it('returns null above the rep ceiling because the formula loses validity', () => {
    expect(epley1RM(100, 13)).toBeNull()
  })

  it.each([[0, 5], [100, 0], [-100, 5], [100, -1], [Number.NaN, 5], [100, Number.NaN]])(
    'returns null for weight %s reps %s', (w, r) => { expect(epley1RM(w, r)).toBeNull() },
  )
})

describe('sessionBest1RM', () => {
  it('picks the highest estimate across the session, not the heaviest weight', () => {
    const session: SessionPerformance = {
      date: '2026-08-03',
      sets: [
        { weight: 200, reps: 1, unit: 'lb' },  // 206.7
        { weight: 175, reps: 8, unit: 'lb' },  // 221.7  <- best
        { weight: 185, reps: 5, unit: 'lb' },  // 215.8
      ],
    }
    expect(sessionBest1RM(session)).toBeCloseTo(221.67, 2)
  })

  it('ignores sets over the rep ceiling', () => {
    expect(sessionBest1RM({ date: '2026-08-03', sets: [{ weight: 100, reps: 20, unit: 'lb' }] })).toBeNull()
  })

  it('returns null for an empty session', () => {
    expect(sessionBest1RM({ date: '2026-08-03', sets: [] })).toBeNull()
  })
})

describe('hasEnough1RMData / oneRepMaxTrend', () => {
  const make = (date: string, weight: number): SessionPerformance =>
    ({ date, sets: [{ weight, reps: 5, unit: 'lb' }] })

  it('requires at least three qualifying sessions', () => {
    expect(hasEnough1RMData([make('2026-08-03', 175), make('2026-08-10', 180)])).toBe(false)
    expect(hasEnough1RMData([make('2026-08-03', 175), make('2026-08-10', 180), make('2026-08-17', 185)])).toBe(true)
  })

  it('does not count sessions that yield no estimate', () => {
    const unusable: SessionPerformance = { date: '2026-08-24', sets: [{ weight: 100, reps: 20, unit: 'lb' }] }
    expect(hasEnough1RMData([make('2026-08-03', 175), make('2026-08-10', 180), unusable])).toBe(false)
  })

  it('returns the trend in ascending date order', () => {
    const trend = oneRepMaxTrend([make('2026-08-17', 185), make('2026-08-03', 175), make('2026-08-10', 180)])
    expect(trend.map((p) => p.date)).toEqual(['2026-08-03', '2026-08-10', '2026-08-17'])
    expect(trend[0]?.estimated1RM).toBeCloseTo(204.17, 2)
  })

  it('omits sessions with no usable estimate from the trend', () => {
    const trend = oneRepMaxTrend([make('2026-08-03', 175), { date: '2026-08-10', sets: [] }])
    expect(trend).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Write the failing personal-bests test**

`src/domain/strength/__tests__/personalBests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { SessionPerformance } from '../oneRepMax'
import { computePersonalBests } from '../personalBests'

const sessions: SessionPerformance[] = [
  { date: '2026-08-03', sets: [{ weight: 175, reps: 5, unit: 'lb' }, { weight: 175, reps: 5, unit: 'lb' }] },
  { date: '2026-08-10', sets: [{ weight: 180, reps: 6, unit: 'lb' }, { weight: 180, reps: 4, unit: 'lb' }] },
  { date: '2026-08-17', sets: [{ weight: 190, reps: 3, unit: 'lb' }] },
]

describe('computePersonalBests', () => {
  const pb = computePersonalBests(sessions)

  it('finds the heaviest set with its date', () => {
    expect(pb.heaviestSet).toEqual({ weight: 190, reps: 3, unit: 'lb', date: '2026-08-17' })
  })

  it('finds the best estimated 1RM with its date', () => {
    // 180x6 -> 216.0 is the highest estimate here (190x3 -> 209.0)
    expect(pb.bestEstimated1RM?.date).toBe('2026-08-10')
    expect(pb.bestEstimated1RM?.value).toBeCloseTo(216, 1)
  })

  it('finds the most reps at or above a given weight', () => {
    expect(pb.mostRepsAtOrAbove(180)).toEqual({ reps: 6, date: '2026-08-10' })
  })

  it('returns null when no set reaches the requested weight', () => {
    expect(pb.mostRepsAtOrAbove(300)).toBeNull()
  })

  it('finds the highest volume session', () => {
    // 2026-08-03: 1750, 2026-08-10: 1800, 2026-08-17: 570
    expect(pb.bestVolumeSession).toEqual({ volume: 1800, unit: 'lb', date: '2026-08-10' })
  })

  it('returns all-null bests for no history', () => {
    const empty = computePersonalBests([])
    expect(empty.heaviestSet).toBeNull()
    expect(empty.bestEstimated1RM).toBeNull()
    expect(empty.bestVolumeSession).toBeNull()
    expect(empty.mostRepsAtOrAbove(100)).toBeNull()
  })

  it('keeps the earliest date when two sessions tie on the heaviest set', () => {
    const tied = computePersonalBests([
      { date: '2026-09-07', sets: [{ weight: 200, reps: 3, unit: 'lb' }] },
      { date: '2026-08-31', sets: [{ weight: 200, reps: 3, unit: 'lb' }] },
    ])
    expect(tied.heaviestSet?.date).toBe('2026-08-31')
  })
})
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm run test:run -- src/domain/strength`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`src/domain/strength/constants.ts`:

```ts
/** Epley loses accuracy past ~12 reps, so estimates above this are withheld. */
export const EPLEY_MAX_REPS = 12
/** Below this many qualifying sessions a 1RM trend line is noise, not signal. */
export const ONE_RM_MIN_SESSIONS = 3
```

`src/domain/strength/oneRepMax.ts` — Epley is `weight * (1 + reps / 30)`. Guard: both inputs finite and positive, `reps <= EPLEY_MAX_REPS`, else `null`. `oneRepMaxTrend` sorts by `date` ascending using plain string comparison (ISO dates sort lexicographically) and filters out sessions with no estimate. `hasEnough1RMData` counts sessions yielding an estimate and compares to `ONE_RM_MIN_SESSIONS`.

`src/domain/strength/personalBests.ts` — single pass over sessions sorted ascending by date; ties resolve to the earliest date because iteration is in ascending order and comparisons use strict `>`. `mostRepsAtOrAbove` is a closure over the same sorted sessions. Volume is `sum(weight * reps)` per session; unit is taken from the first set of that session.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/domain/strength`
Expected: PASS, 20 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Epley 1RM estimation and personal best computation"
```

---

### Task 7: Strength target recommendations (§9)

**Files:**
- Create: `src/domain/recommendations/constants.ts`, `src/domain/recommendations/increments.ts`, `src/domain/recommendations/strengthTarget.ts`
- Test: `src/domain/recommendations/__tests__/strengthTarget.test.ts`, `src/domain/recommendations/__tests__/increments.test.ts`

**Interfaces:**
- Consumes: `Exercise`, `Prescription`, `Load`, `RecommendationMode`, `ISODate` from `@/domain/types`; `SymptomState` from `@/domain/symptoms/evaluate` (Task 8 — declare the minimal shape locally as `RecommendationSymptomState` to avoid a circular dependency, and have Task 8's `SymptomState` structurally satisfy it).
- Produces:
  ```ts
  interface RecommendationSymptomState {
    shin: { level: SymptomLevel; spikeFlag: boolean; persistenceFlag: boolean }
    sciatic: { level: SymptomLevel; spikeFlag: boolean; persistenceFlag: boolean }
  }

  interface StrengthSessionHistory {
    date: ISODate
    prescribedSets: number
    prescribedRepMin: number
    completedSets: { weight: number; unit: Unit; reps: number; rir?: number }[]
  }

  interface StrengthRecommendation {
    previous: { load: Load; reps: number; date: ISODate } | null
    lastWeek: { load: Load; reps: number; date: ISODate } | null
    target: Load
    mode: RecommendationMode
    reason: string
    /** True when `target` is an aim to consider, not a prefill. Prefill stays at `previous`. */
    isOptionalAim: boolean
  }

  recommendStrengthTarget(ctx: {
    exercise: Exercise
    prescription: Pick<Prescription, 'sets' | 'repMin' | 'targetLoad' | 'loadUnit'>
    history: StrengthSessionHistory[]   // most recent first
    symptoms: RecommendationSymptomState
    today: ISODate
    profileBodyWeight: Load
  }): StrengthRecommendation

  effectiveIncrement(exercise: Exercise): Load
  gatingSymptomFor(category: ExerciseCategory): SymptomStream | null
  isSymptomGated(exercise: Exercise, symptoms: RecommendationSymptomState): boolean
  ```

- [ ] **Step 1: Write the failing increments test**

`src/domain/recommendations/__tests__/increments.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Exercise } from '@/domain/types'
import { effectiveIncrement, gatingSymptomFor, isSymptomGated } from '../increments'

const base: Exercise = {
  id: 'ex', name: 'X', category: 'squat', measurementType: 'strengthSets',
  loadStyle: 'totalBarbell', defaultUnit: 'lb', defaultRestSec: 150,
  progressionIncrement: 5, incrementUnit: 'lb', defaultSets: 4, repMin: 4, repMax: 6,
  techniqueNotes: '', isArchived: false, isSeeded: true,
  createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
}

const calm = {
  shin: { level: 'green' as const, spikeFlag: false, persistenceFlag: false },
  sciatic: { level: 'green' as const, spikeFlag: false, persistenceFlag: false },
}

describe('effectiveIncrement', () => {
  it('uses the exercise increment and unit', () => {
    expect(effectiveIncrement({ ...base, progressionIncrement: 10, incrementUnit: 'lb' }))
      .toEqual({ value: 10, unit: 'lb' })
  })

  it('returns a zero increment for station loads so they never auto-increase', () => {
    expect(effectiveIncrement({ ...base, category: 'sled', progressionIncrement: 0, incrementUnit: 'kg' }))
      .toEqual({ value: 0, unit: 'kg' })
  })
})

describe('gatingSymptomFor', () => {
  it.each([
    ['squat', 'sciatic'], ['hinge', 'sciatic'], ['lunge', 'sciatic'], ['carry', 'sciatic'],
    ['plyo', 'shin'], ['run', 'shin'],
    ['press', null], ['pull', null], ['core', null], ['calf', null],
    ['erg', null], ['accessory', null], ['sled', null], ['wallBall', null],
  ] as const)('maps %s to %s', (category, expected) => {
    expect(gatingSymptomFor(category)).toBe(expected)
  })
})

describe('isSymptomGated', () => {
  it('does not gate a bench press when shin pain is elevated (D2)', () => {
    const symptoms = { ...calm, shin: { level: 'elevated' as const, spikeFlag: true, persistenceFlag: false } }
    expect(isSymptomGated({ ...base, category: 'press' }, symptoms)).toBe(false)
  })

  it('gates a back squat when sciatic symptoms are elevated', () => {
    const symptoms = { ...calm, sciatic: { level: 'elevated' as const, spikeFlag: false, persistenceFlag: false } }
    expect(isSymptomGated({ ...base, category: 'squat' }, symptoms)).toBe(true)
  })

  it('gates on a spike flag even when the level is only caution', () => {
    const symptoms = { ...calm, sciatic: { level: 'caution' as const, spikeFlag: true, persistenceFlag: false } }
    expect(isSymptomGated({ ...base, category: 'hinge' }, symptoms)).toBe(true)
  })

  it('gates on a persistence flag', () => {
    const symptoms = { ...calm, shin: { level: 'caution' as const, spikeFlag: false, persistenceFlag: true } }
    expect(isSymptomGated({ ...base, category: 'plyo' }, symptoms)).toBe(true)
  })

  it('does not gate when the relevant stream is green and unflagged', () => {
    expect(isSymptomGated({ ...base, category: 'squat' }, calm)).toBe(false)
  })
})
```

- [ ] **Step 2: Write the failing recommendation test**

`src/domain/recommendations/__tests__/strengthTarget.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Exercise } from '@/domain/types'
import type { StrengthSessionHistory } from '../strengthTarget'
import { recommendStrengthTarget } from '../strengthTarget'

const squat: Exercise = {
  id: 'ex_squat', name: 'Back squat', category: 'squat', measurementType: 'strengthSets',
  loadStyle: 'totalBarbell', defaultUnit: 'lb', defaultRestSec: 150,
  progressionIncrement: 5, incrementUnit: 'lb', defaultSets: 4, repMin: 5, repMax: 5,
  techniqueNotes: '', isArchived: false, isSeeded: true,
  createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
}
const rx = { sets: 4, repMin: 5, targetLoad: 175, loadUnit: 'lb' as const }
const calm = {
  shin: { level: 'green' as const, spikeFlag: false, persistenceFlag: false },
  sciatic: { level: 'green' as const, spikeFlag: false, persistenceFlag: false },
}
const bodyWeight = { value: 210, unit: 'lb' as const }
const TODAY = '2026-08-24'

function session(date: string, weight: number, reps: number, rir?: number): StrengthSessionHistory {
  return {
    date, prescribedSets: 4, prescribedRepMin: 5,
    completedSets: Array.from({ length: 4 }, () => (rir === undefined ? { weight, unit: 'lb' as const, reps } : { weight, unit: 'lb' as const, reps, rir })),
  }
}

function call(history: StrengthSessionHistory[], symptoms = calm) {
  return recommendStrengthTarget({ exercise: squat, prescription: rx, history, symptoms, today: TODAY, profileBodyWeight: bodyWeight })
}

describe('no history', () => {
  const r = call([])

  it('falls back to the prescription target load', () => {
    expect(r.target).toEqual({ value: 175, unit: 'lb' })
  })

  it('reports mode default with no previous performance', () => {
    expect(r.mode).toBe('default')
    expect(r.previous).toBeNull()
  })

  it('explains the fallback', () => {
    expect(r.reason).toBe('First time logging this exercise — starting from the plan default.')
  })
})

describe('no history and no prescription target', () => {
  it('falls back to the exercise default unit with a zero value and says so', () => {
    const r = recommendStrengthTarget({
      exercise: squat, prescription: { sets: 4, repMin: 5 },
      history: [], symptoms: calm, today: TODAY, profileBodyWeight: bodyWeight,
    })
    expect(r.target).toEqual({ value: 0, unit: 'lb' })
    expect(r.mode).toBe('default')
  })
})

describe('all reps completed with RIR >= 1', () => {
  const r = call([session('2026-08-17', 175, 5, 2)])

  it('recommends previous plus the increment', () => {
    expect(r.target).toEqual({ value: 180, unit: 'lb' })
  })

  it('reports mode increase and is not merely an aim', () => {
    expect(r.mode).toBe('increase')
    expect(r.isOptionalAim).toBe(false)
  })

  it('explains why', () => {
    expect(r.reason).toBe('You completed all prescribed reps last time.')
  })

  it('reports the previous performance and its date', () => {
    expect(r.previous).toEqual({ load: { value: 175, unit: 'lb' }, reps: 5, date: '2026-08-17' })
  })
})

describe('all reps completed but no RIR recorded', () => {
  const r = call([session('2026-08-17', 175, 5)])

  it('offers the increase as an optional aim', () => {
    expect(r.mode).toBe('optionalIncrease')
    expect(r.isOptionalAim).toBe(true)
    expect(r.target).toEqual({ value: 180, unit: 'lb' })
  })

  it('explains that the increase is optional because effort was not recorded', () => {
    expect(r.reason).toBe('All reps completed, but no RIR recorded — treat 180 lb as an optional aim.')
  })
})

describe('reps missed', () => {
  const r = call([session('2026-08-17', 175, 4)])

  it('repeats the previous weight', () => {
    expect(r.mode).toBe('repeat')
    expect(r.target).toEqual({ value: 175, unit: 'lb' })
  })

  it('explains the miss', () => {
    expect(r.reason).toBe('Repeating 175 lb — you did not complete all prescribed reps last time.')
  })
})

describe('mean RIR of zero', () => {
  it('repeats the previous weight even though reps were completed', () => {
    const r = call([session('2026-08-17', 175, 5, 0)])
    expect(r.mode).toBe('repeat')
    expect(r.target).toEqual({ value: 175, unit: 'lb' })
    expect(r.reason).toBe('Repeating 175 lb — last set went to failure (RIR 0).')
  })

  it('rounds a mean RIR below 1 down to a repeat', () => {
    const mixed: StrengthSessionHistory = {
      date: '2026-08-17', prescribedSets: 4, prescribedRepMin: 5,
      completedSets: [
        { weight: 175, unit: 'lb', reps: 5, rir: 1 }, { weight: 175, unit: 'lb', reps: 5, rir: 0 },
        { weight: 175, unit: 'lb', reps: 5, rir: 0 }, { weight: 175, unit: 'lb', reps: 5, rir: 0 },
      ],
    }
    expect(call([mixed]).mode).toBe('repeat')
  })
})

describe('fewer sets completed than prescribed', () => {
  it('counts as a missed session and repeats', () => {
    const short: StrengthSessionHistory = {
      date: '2026-08-17', prescribedSets: 4, prescribedRepMin: 5,
      completedSets: [{ weight: 175, unit: 'lb', reps: 5, rir: 3 }, { weight: 175, unit: 'lb', reps: 5, rir: 3 }],
    }
    expect(call([short]).mode).toBe('repeat')
  })
})

describe('symptom gating (D2)', () => {
  it('holds the weight when sciatic symptoms are elevated, naming the symptom', () => {
    const symptoms = { ...calm, sciatic: { level: 'elevated' as const, spikeFlag: false, persistenceFlag: false } }
    const r = call([session('2026-08-17', 175, 5, 3)], symptoms)
    expect(r.mode).toBe('symptomHold')
    expect(r.target).toEqual({ value: 175, unit: 'lb' })
    expect(r.reason).toBe('Holding 175 lb while sciatic/back symptoms are elevated.')
  })

  it('still progresses a squat when only shin pain is elevated', () => {
    const symptoms = { ...calm, shin: { level: 'elevated' as const, spikeFlag: true, persistenceFlag: false } }
    expect(call([session('2026-08-17', 175, 5, 3)], symptoms).mode).toBe('increase')
  })

  it('takes precedence over an otherwise-qualifying increase', () => {
    const symptoms = { ...calm, sciatic: { level: 'caution' as const, spikeFlag: true, persistenceFlag: false } }
    expect(call([session('2026-08-17', 175, 5, 4)], symptoms).mode).toBe('symptomHold')
  })
})

describe('last week vs most recent (§8)', () => {
  it('reports lastWeek when a session exists in the previous calendar week', () => {
    // TODAY is Mon 2026-08-24; the previous calendar week is 2026-08-17..2026-08-23
    const r = call([session('2026-08-19', 180, 5, 2), session('2026-08-12', 175, 5, 2)])
    expect(r.lastWeek?.date).toBe('2026-08-19')
  })

  it('reports lastWeek as null when the most recent session predates the previous week', () => {
    const r = call([session('2026-07-20', 175, 5, 2)])
    expect(r.lastWeek).toBeNull()
    expect(r.previous?.date).toBe('2026-07-20')
  })

  it('always reports the most recent session as previous regardless of age', () => {
    expect(call([session('2026-02-02', 165, 5, 2)]).previous?.date).toBe('2026-02-02')
  })
})

describe('determinism and non-destructiveness', () => {
  it('returns an identical result for identical input', () => {
    const history = [session('2026-08-17', 175, 5, 2)]
    expect(call(history)).toEqual(call(history))
  })

  it('does not mutate the supplied history', () => {
    const history = [session('2026-08-17', 175, 5, 2)]
    const snapshot = structuredClone(history)
    call(history)
    expect(history).toEqual(snapshot)
  })

  it('never increases a station load because the increment is zero', () => {
    const sled: Exercise = { ...squat, id: 'ex_sled', category: 'sled', progressionIncrement: 0, incrementUnit: 'kg', defaultUnit: 'kg' }
    const r = recommendStrengthTarget({
      exercise: sled, prescription: { sets: 6, repMin: 1, targetLoad: 152, loadUnit: 'kg' },
      history: [{ date: '2026-08-17', prescribedSets: 6, prescribedRepMin: 1, completedSets: [{ weight: 152, unit: 'kg', reps: 1, rir: 3 }] }],
      symptoms: calm, today: TODAY, profileBodyWeight: bodyWeight,
    })
    expect(r.target).toEqual({ value: 152, unit: 'kg' })
  })
})
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm run test:run -- src/domain/recommendations`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement increments and gating**

`src/domain/recommendations/constants.ts`:

```ts
/** Mean RIR at or above this means there was room to add load. */
export const MIN_RIR_FOR_INCREASE = 1
/** Standard barbell jump. */
export const DEFAULT_INCREMENT_LB = 5
/** Per-hand dumbbell jump. */
export const DEFAULT_DUMBBELL_INCREMENT_LB = 5
/** Typical machine stack plate. */
export const DEFAULT_MACHINE_INCREMENT_LB = 10
/** Station loads follow competition standards, so they never auto-increase (§9). */
export const STATION_INCREMENT = 0
```

`src/domain/recommendations/increments.ts` — `gatingSymptomFor` is an exhaustive `Record<ExerciseCategory, SymptomStream | null>` so adding a category is a compile error until mapped. `sciatic` gates `squat | hinge | lunge | carry`; `shin` gates `plyo | run`; everything else `null`. Note in a comment: `calf` is deliberately ungated because calf and tibialis work is the *treatment* for shin symptoms, not a driver of them; `sled` and `wallBall` are ungated because their loads are fixed by competition standard and never auto-progress.

`isSymptomGated` returns true when the gating stream's `level === 'elevated'` **or** `spikeFlag` **or** `persistenceFlag`.

- [ ] **Step 5: Implement the recommendation rules**

`src/domain/recommendations/strengthTarget.ts` — evaluate in exactly this order, matching the spec §4.3 table:

1. No usable history → `default`, target = `prescription.targetLoad ?? 0` with unit `prescription.loadUnit ?? exercise.defaultUnit`.
2. `isSymptomGated` → `symptomHold`, target = previous load.
3. All prescribed sets present **and** every set met `prescribedRepMin` **and** mean RIR (over sets that recorded one) ≥ `MIN_RIR_FOR_INCREASE` → `increase`, target = previous + increment.
4. All sets and reps met but **no** set recorded a RIR → `optionalIncrease`, target = previous + increment, `isOptionalAim: true`.
5. Otherwise → `repeat`, target = previous load. Reason distinguishes "did not complete all prescribed reps" from "went to failure (RIR 0)" by checking whether reps were the failure cause first.

`lastWeek` is the most recent session whose date falls in the ISO calendar week immediately preceding the week containing `today` (Monday-start weeks; compute with pure string/UTC date arithmetic in a local helper `previousWeekRange(today)`, no ambient `Date`). `previous` is `history[0]` after sorting descending by date — the function sorts a **copy**, never the input.

Increment is added only when `increment.unit === previousLoad.unit`; if they differ, convert the increment into the previous load's unit via `convertLoad` before adding, so a kg-incremented exercise logged in lb still progresses correctly.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:run -- src/domain/recommendations`
Expected: PASS, 31 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add deterministic strength target recommendations with symptom gating"
```

---

### Task 8: Symptom evaluation, substitutions, and red flags (§16)

**Files:**
- Create: `src/domain/symptoms/constants.ts`, `src/domain/symptoms/evaluate.ts`, `src/domain/symptoms/substitutions.ts`, `src/domain/symptoms/redFlags.ts`
- Test: `src/domain/symptoms/__tests__/evaluate.test.ts`, `src/domain/symptoms/__tests__/substitutions.test.ts`

**Interfaces:**
- Consumes: `SymptomLog`, `SymptomLevel`, `SymptomStream`, `ISODate` from `@/domain/types`.
- Produces:
  ```ts
  interface StreamState {
    latest: number | null
    baseline: number | null
    level: SymptomLevel
    spikeFlag: boolean
    persistenceFlag: boolean
    reasons: string[]
    series: { date: ISODate; value: number }[]
  }
  interface SymptomState {
    shin: StreamState
    sciatic: StreamState
    meanSessionRpe: number | null
    anyFlag: boolean
    needsRedFlagScreen: boolean
  }
  evaluateSymptoms(logs: SymptomLog[], today: ISODate, windowDays?: number): SymptomState
  levelFor(score: number): SymptomLevel

  type SubstitutionKind =
    | 'reduceImpactVolume' | 'swapHardRunForLowImpact' | 'maintainCalfTibialis'
    | 'holdLoadProgression' | 'seekAssessment' | 'stopAggravatingExercise'
  interface Substitution {
    kind: SubstitutionKind
    stream: SymptomStream
    title: string
    detail: string
    /** Always appended to every card by the UI. */
    disclaimer: string
  }
  suggestSubstitutions(state: SymptomState): Substitution[]

  const RED_FLAG_QUESTIONS: { id: string; label: string }[]
  interface RedFlagAnswers { bowelBladder: boolean; saddleNumbness: boolean; progressiveWeakness: boolean }
  hasUrgentRedFlag(answers: RedFlagAnswers): boolean
  urgentRedFlagMessage(): string
  ```

- [ ] **Step 1: Write the failing evaluation test**

`src/domain/symptoms/__tests__/evaluate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { SymptomLog } from '@/domain/types'
import { evaluateSymptoms, levelFor } from '../evaluate'

let seq = 0
function log(forDate: string, shin: number, sciatic: number, rpe = 6): SymptomLog {
  seq += 1
  return {
    id: `sym_${String(seq)}`, forDate, shinPain: shin, sciaticPain: sciatic,
    sessionRpe: rpe, notes: '', loggedAt: `${forDate}T18:00:00.000Z`,
  }
}

const TODAY = '2026-09-01'

describe('levelFor', () => {
  it.each([[0, 'green'], [2, 'green'], [3, 'caution'], [4, 'caution'], [5, 'elevated'], [10, 'elevated']] as const)(
    'maps %i to %s', (score, expected) => { expect(levelFor(score)).toBe(expected) },
  )
})

describe('levels', () => {
  it('reports green for a calm latest value', () => {
    expect(evaluateSymptoms([log('2026-08-31', 1, 0)], TODAY).shin.level).toBe('green')
  })

  it('reports caution at 3', () => {
    expect(evaluateSymptoms([log('2026-08-31', 3, 0)], TODAY).shin.level).toBe('caution')
  })

  it('reports elevated at 5', () => {
    expect(evaluateSymptoms([log('2026-08-31', 5, 0)], TODAY).shin.level).toBe('elevated')
  })

  it('reports green with no logs at all', () => {
    const s = evaluateSymptoms([], TODAY)
    expect(s.shin.level).toBe('green')
    expect(s.shin.latest).toBeNull()
    expect(s.shin.baseline).toBeNull()
    expect(s.anyFlag).toBe(false)
  })
})

describe('spike flag (D13)', () => {
  it('flags a rise of two or more points above the baseline of the prior five logs', () => {
    // baseline over logs 2..6 = mean(1,1,0,1,1) = 0.8; latest 3 -> delta 2.2
    const logs = [
      log('2026-08-31', 3, 0), log('2026-08-29', 1, 0), log('2026-08-27', 1, 0),
      log('2026-08-25', 0, 0), log('2026-08-23', 1, 0), log('2026-08-21', 1, 0),
    ]
    const s = evaluateSymptoms(logs, TODAY)
    expect(s.shin.baseline).toBeCloseTo(0.8, 6)
    expect(s.shin.spikeFlag).toBe(true)
    expect(s.shin.reasons).toContain('Shin pain is 2.2 points above your recent baseline.')
  })

  it('does not flag a rise below two points', () => {
    const logs = [
      log('2026-08-31', 2, 0), log('2026-08-29', 1, 0), log('2026-08-27', 1, 0),
      log('2026-08-25', 1, 0), log('2026-08-23', 1, 0),
    ]
    expect(evaluateSymptoms(logs, TODAY).shin.spikeFlag).toBe(false)
  })

  it('does not flag without the minimum baseline samples', () => {
    const logs = [log('2026-08-31', 5, 0), log('2026-08-29', 0, 0)]
    const s = evaluateSymptoms(logs, TODAY)
    expect(s.shin.baseline).toBeNull()
    expect(s.shin.spikeFlag).toBe(false)
  })

  it('excludes the latest log from its own baseline', () => {
    const logs = [
      log('2026-08-31', 6, 0), log('2026-08-29', 0, 0), log('2026-08-27', 0, 0), log('2026-08-25', 0, 0),
    ]
    expect(evaluateSymptoms(logs, TODAY).shin.baseline).toBe(0)
  })
})

describe('persistence flag', () => {
  it('flags three consecutive logs at three or above', () => {
    const logs = [log('2026-08-31', 3, 0), log('2026-08-29', 4, 0), log('2026-08-27', 3, 0)]
    const s = evaluateSymptoms(logs, TODAY)
    expect(s.shin.persistenceFlag).toBe(true)
    expect(s.shin.reasons).toContain('Shin pain has been 3 or higher for 3 workouts in a row.')
  })

  it('does not flag when the streak is broken', () => {
    const logs = [log('2026-08-31', 3, 0), log('2026-08-29', 1, 0), log('2026-08-27', 3, 0)]
    expect(evaluateSymptoms(logs, TODAY).shin.persistenceFlag).toBe(false)
  })

  it('does not flag with only two qualifying logs', () => {
    expect(evaluateSymptoms([log('2026-08-31', 4, 0), log('2026-08-29', 4, 0)], TODAY).shin.persistenceFlag).toBe(false)
  })

  it('tracks the two streams independently', () => {
    const logs = [log('2026-08-31', 0, 3), log('2026-08-29', 0, 4), log('2026-08-27', 0, 5)]
    const s = evaluateSymptoms(logs, TODAY)
    expect(s.sciatic.persistenceFlag).toBe(true)
    expect(s.shin.persistenceFlag).toBe(false)
  })
})

describe('series and windowing', () => {
  it('returns the series in ascending date order for charting', () => {
    const logs = [log('2026-08-31', 2, 1), log('2026-08-25', 1, 0), log('2026-08-29', 3, 2)]
    expect(evaluateSymptoms(logs, TODAY).shin.series.map((p) => p.date))
      .toEqual(['2026-08-25', '2026-08-29', '2026-08-31'])
  })

  it('excludes logs outside the window from the series', () => {
    const logs = [log('2026-08-31', 2, 1), log('2026-01-05', 9, 9)]
    const s = evaluateSymptoms(logs, TODAY, 90)
    expect(s.shin.series).toHaveLength(1)
  })

  it('still uses only in-window logs for flags', () => {
    const logs = [log('2026-08-31', 2, 1), log('2026-01-05', 9, 9)]
    expect(evaluateSymptoms(logs, TODAY, 90).shin.spikeFlag).toBe(false)
  })
})

describe('aggregate state', () => {
  it('reports anyFlag when either stream is flagged', () => {
    const logs = [log('2026-08-31', 0, 3), log('2026-08-29', 0, 4), log('2026-08-27', 0, 3)]
    expect(evaluateSymptoms(logs, TODAY).anyFlag).toBe(true)
  })

  it('computes the mean session RPE across the window', () => {
    const logs = [log('2026-08-31', 0, 0, 6), log('2026-08-29', 0, 0, 8)]
    expect(evaluateSymptoms(logs, TODAY).meanSessionRpe).toBe(7)
  })

  it('requests the red flag screen when sciatic reaches five (D11)', () => {
    expect(evaluateSymptoms([log('2026-08-31', 0, 5)], TODAY).needsRedFlagScreen).toBe(true)
  })

  it('requests the red flag screen when the sciatic stream is flagged', () => {
    const logs = [log('2026-08-31', 0, 3), log('2026-08-29', 0, 3), log('2026-08-27', 0, 4)]
    expect(evaluateSymptoms(logs, TODAY).needsRedFlagScreen).toBe(true)
  })

  it('does not request the screen for shin symptoms alone', () => {
    expect(evaluateSymptoms([log('2026-08-31', 8, 0)], TODAY).needsRedFlagScreen).toBe(false)
  })
})

describe('purity', () => {
  it('does not mutate the input array', () => {
    const logs = [log('2026-08-31', 2, 1), log('2026-08-25', 1, 0)]
    const snapshot = structuredClone(logs)
    evaluateSymptoms(logs, TODAY)
    expect(logs).toEqual(snapshot)
  })
})
```

- [ ] **Step 2: Write the failing substitutions test**

`src/domain/symptoms/__tests__/substitutions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { SymptomState } from '../evaluate'
import { hasUrgentRedFlag, RED_FLAG_QUESTIONS, urgentRedFlagMessage } from '../redFlags'
import { suggestSubstitutions } from '../substitutions'

function state(over: Partial<SymptomState['shin']> = {}, sciatic: Partial<SymptomState['sciatic']> = {}): SymptomState {
  const blank = { latest: 0, baseline: 0, level: 'green' as const, spikeFlag: false, persistenceFlag: false, reasons: [], series: [] }
  return {
    shin: { ...blank, ...over }, sciatic: { ...blank, ...sciatic },
    meanSessionRpe: 6, anyFlag: false, needsRedFlagScreen: false,
  }
}

describe('suggestSubstitutions', () => {
  it('suggests nothing when both streams are calm', () => {
    expect(suggestSubstitutions(state())).toEqual([])
  })

  it('suggests impact reduction and low-impact swap for elevated shin pain', () => {
    const kinds = suggestSubstitutions(state({ latest: 6, level: 'elevated' })).map((s) => s.kind)
    expect(kinds).toContain('reduceImpactVolume')
    expect(kinds).toContain('swapHardRunForLowImpact')
    expect(kinds).toContain('maintainCalfTibialis')
    expect(kinds).toContain('holdLoadProgression')
  })

  it('mentions the 20-30% impact reduction range', () => {
    const s = suggestSubstitutions(state({ latest: 6, level: 'elevated' }))
    expect(s.find((x) => x.kind === 'reduceImpactVolume')?.detail).toMatch(/20[–-]30%/)
  })

  it('names SkiErg or rowing in the low-impact swap', () => {
    const s = suggestSubstitutions(state({ latest: 6, level: 'elevated' }))
    expect(s.find((x) => x.kind === 'swapHardRunForLowImpact')?.detail).toMatch(/SkiErg|row/i)
  })

  it('suggests assessment when a stream persists', () => {
    const kinds = suggestSubstitutions(state({ latest: 3, level: 'caution', persistenceFlag: true })).map((s) => s.kind)
    expect(kinds).toContain('seekAssessment')
  })

  it('suggests stopping the aggravating exercise for elevated sciatic symptoms', () => {
    const kinds = suggestSubstitutions(state({}, { latest: 7, level: 'elevated' })).map((s) => s.kind)
    expect(kinds).toContain('stopAggravatingExercise')
    expect(kinds).toContain('seekAssessment')
  })

  it('attributes each suggestion to the stream that caused it', () => {
    const s = suggestSubstitutions(state({ latest: 6, level: 'elevated' }))
    expect(s.every((x) => x.stream === 'shin')).toBe(true)
  })

  it('carries the non-diagnosis disclaimer on every suggestion', () => {
    const s = suggestSubstitutions(state({ latest: 6, level: 'elevated' }, { latest: 6, level: 'elevated' }))
    expect(s.length).toBeGreaterThan(0)
    expect(s.every((x) => x.disclaimer === 'Training-load suggestion, not a medical diagnosis.')).toBe(true)
  })

  it('produces no duplicate kinds for the same stream', () => {
    const s = suggestSubstitutions(state({ latest: 6, level: 'elevated', spikeFlag: true, persistenceFlag: true }))
    const keys = s.map((x) => `${x.stream}:${x.kind}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('red flags', () => {
  it('offers exactly the three screening questions', () => {
    expect(RED_FLAG_QUESTIONS.map((q) => q.id)).toEqual(['bowelBladder', 'saddleNumbness', 'progressiveWeakness'])
  })

  it('is urgent when any answer is yes', () => {
    expect(hasUrgentRedFlag({ bowelBladder: true, saddleNumbness: false, progressiveWeakness: false })).toBe(true)
    expect(hasUrgentRedFlag({ bowelBladder: false, saddleNumbness: true, progressiveWeakness: false })).toBe(true)
    expect(hasUrgentRedFlag({ bowelBladder: false, saddleNumbness: false, progressiveWeakness: true })).toBe(true)
  })

  it('is not urgent when all answers are no', () => {
    expect(hasUrgentRedFlag({ bowelBladder: false, saddleNumbness: false, progressiveWeakness: false })).toBe(false)
  })

  it('directs the athlete to urgent assessment without diagnosing', () => {
    const msg = urgentRedFlagMessage()
    expect(msg).toMatch(/urgent/i)
    expect(msg).not.toMatch(/diagnos(is|e)\b(?! )/i)
  })
})
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm run test:run -- src/domain/symptoms`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`src/domain/symptoms/constants.ts`:

```ts
/** 0-2 is green. */
export const SYMPTOM_GREEN_MAX = 2
/** 3-4 is caution; 5 and above is elevated. */
export const SYMPTOM_CAUTION_MAX = 4
/** A rise of this many points over the recent baseline is flagged. */
export const SYMPTOM_SPIKE_DELTA = 2
/** This many consecutive logs at or above SYMPTOM_PERSISTENCE_MIN_SCORE is flagged. */
export const SYMPTOM_PERSISTENCE_COUNT = 3
export const SYMPTOM_PERSISTENCE_MIN_SCORE = 3
/** Baseline is the mean of up to this many logs immediately preceding the latest. */
export const SYMPTOM_BASELINE_WINDOW = 5
/** Below this many baseline samples the mean is noise, so no spike is flagged. */
export const SYMPTOM_BASELINE_MIN_SAMPLES = 3
/** Charting and flag window. */
export const SYMPTOM_SERIES_WINDOW_DAYS = 90
/** Sciatic score at or above this triggers the red-flag screen (D11). */
export const RED_FLAG_SCREEN_SCIATIC_MIN = 5
export const SYMPTOM_DISCLAIMER = 'Training-load suggestion, not a medical diagnosis.'
```

`src/domain/symptoms/evaluate.ts` — sort a copy descending by `forDate`, filter to the window using pure ISO date arithmetic (a shared `src/domain/dates.ts` helper set: `addDays`, `daysBetween`, `startOfIsoWeek`, `compareDates` — create it in this task, all string-in/string-out, all UTC, no ambient `Date`). Baseline = mean of logs at indices 1..`SYMPTOM_BASELINE_WINDOW`, requiring at least `SYMPTOM_BASELINE_MIN_SAMPLES`. Reason strings must match the test literals exactly, with the delta rendered to one decimal place.

`src/domain/symptoms/substitutions.ts` — build per stream, dedupe by `${stream}:${kind}`. Mapping: elevated **or** spike → `reduceImpactVolume`, `swapHardRunForLowImpact` (shin only), `holdLoadProgression`, `maintainCalfTibialis` (shin only); persistence → `seekAssessment`; sciatic elevated → `stopAggravatingExercise` + `seekAssessment`. Every item gets `disclaimer: SYMPTOM_DISCLAIMER`.

`src/domain/symptoms/redFlags.ts` — the three questions with plain-language labels, `hasUrgentRedFlag` as a boolean OR, and `urgentRedFlagMessage()` returning copy that says to stop training and seek urgent in-person assessment today, explicitly framed as a safety prompt rather than a diagnosis.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/domain/symptoms`
Expected: PASS, 33 tests.

- [ ] **Step 6: Create the shared date helpers test and confirm it passes**

`src/domain/__tests__/dates.test.ts` — cover `addDays('2026-02-28', 1) === '2026-03-01'` (2026 is not a leap year), `addDays('2028-02-28', 1) === '2028-02-29'`, `addDays('2026-12-31', 1) === '2027-01-01'`, `daysBetween('2026-08-24', '2026-09-01') === 8`, negative and zero deltas, `startOfIsoWeek('2026-08-26') === '2026-08-24'` (Monday), `startOfIsoWeek('2026-08-24') === '2026-08-24'`, and `startOfIsoWeek('2026-08-23') === '2026-08-17'` (Sunday belongs to the prior ISO week).

Run: `npm run test:run -- src/domain/__tests__/dates.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add symptom trend evaluation, substitutions, and red-flag screening"
```

---

### Task 9: Recovery conflict matrix and day eligibility (§15)

**Files:**
- Create: `src/domain/queue/constants.ts`, `src/domain/queue/recoveryMatrix.ts`, `src/domain/queue/eligibility.ts`
- Test: `src/domain/queue/__tests__/recoveryMatrix.test.ts`, `src/domain/queue/__tests__/eligibility.test.ts`

**Interfaces:**
- Consumes: `RecoveryTag`, `ISODate` from `@/domain/types`; date helpers from `@/domain/dates`.
- Produces:
  ```ts
  type ConflictSeverity = 'hard' | 'soft'
  interface Conflict { severity: ConflictSeverity; reason: string; againstDate: ISODate }

  /** A day that already has a workout, for eligibility purposes. */
  interface OccupiedDay { date: ISODate; tags: RecoveryTag[] }

  conflictBetween(previousTags: RecoveryTag[], candidateTags: RecoveryTag[]): ConflictSeverity | null
  simulationClearanceConflict(occupied: OccupiedDay[], candidate: ISODate, candidateTags: RecoveryTag[]): Conflict | null

  interface EligibilityResult { eligible: boolean; conflicts: Conflict[]; blockedBy: 'dayOccupied' | 'restDayRule' | 'recoveryConflict' | 'pastRaceDate' | null }
  isDayEligible(args: {
    candidate: ISODate
    candidateTags: RecoveryTag[]
    occupied: OccupiedDay[]
    raceDate: ISODate
    ignoreSoftConflicts?: boolean
  }): EligibilityResult
  ```

- [ ] **Step 1: Write the failing matrix test**

`src/domain/queue/__tests__/recoveryMatrix.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { conflictBetween } from '../recoveryMatrix'

describe('conflictBetween', () => {
  it('blocks hard running on consecutive days', () => {
    expect(conflictBetween(['hardRun'], ['hardRun'])).toBe('hard')
  })

  it('blocks a hard run the day after a long run', () => {
    expect(conflictBetween(['longRun'], ['hardRun'])).toBe('hard')
  })

  it('blocks a long run the day after a hard run', () => {
    expect(conflictBetween(['hardRun'], ['longRun'])).toBe('hard')
  })

  it('blocks heavy lower-body strength immediately before running intervals', () => {
    expect(conflictBetween(['lowerBodyStrength'], ['hardRun'])).toBe('hard')
  })

  it('warns but allows high-impact station work before a hard run', () => {
    expect(conflictBetween(['highImpactStation'], ['hardRun'])).toBe('soft')
  })

  it('warns on back-to-back lower-body strength', () => {
    expect(conflictBetween(['lowerBodyStrength'], ['lowerBodyStrength'])).toBe('soft')
  })

  it('allows an easy run after anything', () => {
    expect(conflictBetween(['hardRun'], ['easyRun'])).toBeNull()
    expect(conflictBetween(['lowerBodyStrength'], ['easyRun'])).toBeNull()
  })

  it('allows anything after low-impact aerobic work', () => {
    expect(conflictBetween(['lowImpactAerobic'], ['hardRun'])).toBeNull()
    expect(conflictBetween(['recovery'], ['lowerBodyStrength'])).toBeNull()
  })

  it('allows upper-body strength before a hard run', () => {
    expect(conflictBetween(['upperBodyStrength'], ['hardRun'])).toBeNull()
  })

  it('returns the most severe conflict across multi-tag sessions', () => {
    expect(conflictBetween(['upperBodyStrength', 'lowerBodyStrength'], ['hardRun'])).toBe('hard')
  })

  it('returns null for empty tag sets', () => {
    expect(conflictBetween([], ['hardRun'])).toBeNull()
    expect(conflictBetween(['hardRun'], [])).toBeNull()
  })
})
```

- [ ] **Step 2: Write the failing eligibility test**

`src/domain/queue/__tests__/eligibility.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isDayEligible, simulationClearanceConflict } from '../eligibility'

const RACE = '2027-01-16'

describe('never two workouts in one day', () => {
  it('rejects a day that already has a workout', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['easyRun'],
      occupied: [{ date: '2026-08-25', tags: ['lowerBodyStrength'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('dayOccupied')
  })
})

describe('one rest day per rolling seven days', () => {
  it('rejects a placement that would fill all seven days of a window', () => {
    const occupied = ['2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24']
      .map((date) => ({ date, tags: ['lowImpactAerobic' as const] }))
    const r = isDayEligible({ candidate: '2026-08-25', candidateTags: ['lowImpactAerobic'], occupied, raceDate: RACE })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('restDayRule')
  })

  it('allows a sixth workout in a seven-day window', () => {
    const occupied = ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24']
      .map((date) => ({ date, tags: ['lowImpactAerobic' as const] }))
    expect(isDayEligible({ candidate: '2026-08-25', candidateTags: ['lowImpactAerobic'], occupied, raceDate: RACE }).eligible).toBe(true)
  })

  it('checks every rolling window containing the candidate, not just the trailing one', () => {
    // Candidate 2026-08-25; the window 2026-08-25..2026-08-31 is already full.
    const occupied = ['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31']
      .map((date) => ({ date, tags: ['lowImpactAerobic' as const] }))
    const r = isDayEligible({ candidate: '2026-08-25', candidateTags: ['lowImpactAerobic'], occupied, raceDate: RACE })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('restDayRule')
  })
})

describe('recovery conflicts', () => {
  it('rejects a hard run the day after a hard run', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['hardRun'],
      occupied: [{ date: '2026-08-24', tags: ['hardRun'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('recoveryConflict')
    expect(r.conflicts[0]?.severity).toBe('hard')
  })

  it('also checks the day after the candidate', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['hardRun'],
      occupied: [{ date: '2026-08-26', tags: ['hardRun'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(false)
  })

  it('reports a soft conflict but stays eligible', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['hardRun'],
      occupied: [{ date: '2026-08-24', tags: ['highImpactStation'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(true)
    expect(r.conflicts[0]?.severity).toBe('soft')
  })

  it('omits soft conflicts entirely when asked to ignore them', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['hardRun'],
      occupied: [{ date: '2026-08-24', tags: ['highImpactStation'] }], raceDate: RACE,
      ignoreSoftConflicts: true,
    })
    expect(r.conflicts).toEqual([])
  })

  it('ignores days more than one apart for the pairwise matrix', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['hardRun'],
      occupied: [{ date: '2026-08-23', tags: ['hardRun'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(true)
  })
})

describe('race simulation clearance', () => {
  it('requires two clear days after a simulation before hard work', () => {
    const occupied = [{ date: '2026-08-24', tags: ['raceSimulation' as const] }]
    expect(simulationClearanceConflict(occupied, '2026-08-26', ['hardRun'])?.severity).toBe('hard')
  })

  it('permits hard work on the third day after a simulation', () => {
    const occupied = [{ date: '2026-08-24', tags: ['raceSimulation' as const] }]
    expect(simulationClearanceConflict(occupied, '2026-08-27', ['hardRun'])).toBeNull()
  })

  it('permits easy work the day after a simulation', () => {
    const occupied = [{ date: '2026-08-24', tags: ['raceSimulation' as const] }]
    expect(simulationClearanceConflict(occupied, '2026-08-25', ['easyRun'])).toBeNull()
  })

  it('is surfaced through isDayEligible', () => {
    const r = isDayEligible({
      candidate: '2026-08-26', candidateTags: ['lowerBodyStrength'],
      occupied: [{ date: '2026-08-24', tags: ['raceSimulation'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('recoveryConflict')
  })
})

describe('race date anchoring', () => {
  it('rejects a day after the race date', () => {
    const r = isDayEligible({ candidate: '2027-01-17', candidateTags: ['easyRun'], occupied: [], raceDate: RACE })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('pastRaceDate')
  })

  it('accepts the race date itself', () => {
    expect(isDayEligible({ candidate: RACE, candidateTags: ['raceSimulation'], occupied: [], raceDate: RACE }).eligible).toBe(true)
  })
})

describe('precedence of blocking reasons', () => {
  it('reports pastRaceDate before anything else', () => {
    const r = isDayEligible({
      candidate: '2027-01-17', candidateTags: ['hardRun'],
      occupied: [{ date: '2027-01-17', tags: ['hardRun'] }], raceDate: RACE,
    })
    expect(r.blockedBy).toBe('pastRaceDate')
  })

  it('reports dayOccupied before the rest day rule', () => {
    const occupied = ['2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25']
      .map((date) => ({ date, tags: ['lowImpactAerobic' as const] }))
    expect(isDayEligible({ candidate: '2026-08-25', candidateTags: ['easyRun'], occupied, raceDate: RACE }).blockedBy).toBe('dayOccupied')
  })
})
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm run test:run -- src/domain/queue`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the constants and matrix**

`src/domain/queue/constants.ts`:

```ts
/** Four sessions is the minimum effective week (§15). */
export const MIN_EFFECTIVE_WEEK_SESSIONS = 4
/** Six sessions is the ideal week; five and six are additional productive volume. */
export const IDEAL_WEEK_SESSIONS = 6
/** Rest-day invariant is evaluated over every window of this length. */
export const ROLLING_WINDOW_DAYS = 7
export const MIN_REST_DAYS_PER_ROLLING_WINDOW = 1
/** A race simulation needs this many clear days before hard work resumes. */
export const SIMULATION_CLEAR_DAYS_AFTER = 2
/** The matrix only compares immediately adjacent days. */
export const ADJACENT_DAY_SPAN = 1
```

`src/domain/queue/recoveryMatrix.ts` — a table of `{ previous: RecoveryTag; candidate: RecoveryTag; severity: ConflictSeverity }` rows exactly as in the spec §4.2 matrix. `conflictBetween` takes the cross product of the two tag arrays, collects matching severities, and returns `'hard'` if any is hard, else `'soft'` if any is soft, else `null`.

- [ ] **Step 5: Implement eligibility**

`src/domain/queue/eligibility.ts` — evaluation order is exactly the precedence the tests assert:

1. `candidate > raceDate` → `pastRaceDate`.
2. Any occupied day equals `candidate` → `dayOccupied`.
3. Rest-day rule: for every window start from `candidate - (ROLLING_WINDOW_DAYS - 1)` to `candidate`, count occupied days in `[start, start + ROLLING_WINDOW_DAYS - 1]` plus the candidate; if any window would have zero free days → `restDayRule`. Checking every window (not only the trailing one) is what the third rest-day test pins down.
4. Pairwise matrix against `candidate ± ADJACENT_DAY_SPAN`, plus `simulationClearanceConflict`. A `hard` conflict → `recoveryConflict`; `soft` conflicts are recorded in `conflicts` but leave `eligible: true`.

`simulationClearanceConflict` finds occupied days tagged `raceSimulation` within `SIMULATION_CLEAR_DAYS_AFTER` days before the candidate and returns a hard conflict when the candidate carries any of `hardRun | longRun | lowerBodyStrength | raceSimulation`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:run -- src/domain/queue`
Expected: PASS, 26 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add recovery conflict matrix and day eligibility rules"
```

---

### Task 10: Queue recomputation (§15)

This is the highest-risk module in the project. Build it strictly test-first.

**Files:**
- Create: `src/domain/queue/explain.ts`, `src/domain/queue/recompute.ts`
- Test: `src/domain/queue/__tests__/recompute.test.ts`, `src/domain/queue/__tests__/recompute.fixtures.ts`

**Interfaces:**
- Consumes: everything from Task 9; `WorkoutInstance`, `ScheduleEvent`, `ScheduleOverride`, `Priority`, `WorkoutStatus`, `RecoveryTag`, `ISODate` from `@/domain/types`; `RecommendationSymptomState` from Task 7.
- Produces:
  ```ts
  /** The immutable definition of one planned session, independent of any event history. */
  interface QueueTemplate {
    templateId: string
    weekNumber: number
    sessionSlot: number
    sequenceInWeek: number
    priority: Priority
    recoveryTags: RecoveryTag[]
    name: string
  }

  interface QueueInput {
    planStartDate: ISODate
    raceDate: ISODate
    templates: QueueTemplate[]
    events: ScheduleEvent[]          // any order; sorted internally by `at`
    overrides: ScheduleOverride[]
    today: ISODate
  }

  interface ScheduledInstance {
    templateId: string
    weekNumber: number
    sessionSlot: number
    sequence: number
    name: string
    priority: Priority
    recoveryTags: RecoveryTag[]
    plannedDate: ISODate
    scheduledDate: ISODate | null    // null when dropped or skipped
    status: WorkoutStatus
    completedForDate: ISODate | null
    isManualOverride: boolean
    adjustmentReason: string | null
    softConflicts: string[]
  }

  interface QueueResult {
    instances: ScheduledInstance[]
    explanations: { templateId: string | null; weekNumber: number | null; text: string }[]
    dropped: { templateId: string; priority: Priority; reason: string }[]
  }

  recomputeQueue(input: QueueInput): QueueResult
  ```

**Slot-to-day mapping.** `plannedDate = addDays(planStartDate, (weekNumber - 1) * 7 + SLOT_DAY_OFFSET[sessionSlot])`. `planStartDate` is always a Monday (enforced in Task 11). `SLOT_DAY_OFFSET = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 }` — Monday through Saturday, Sunday free. Export it from `src/domain/queue/constants.ts`.

- [ ] **Step 1: Write the fixture builder**

`src/domain/queue/__tests__/recompute.fixtures.ts`:

```ts
import type { ScheduleEvent, ScheduleEventType } from '@/domain/types'
import type { QueueInput, QueueTemplate } from '../recompute'

export const PLAN_START = '2026-08-03'  // a Monday
export const RACE_DATE = '2027-01-16'

/** Standard 6-slot week matching the plan's default weekly structure (§19). */
export function weekTemplates(weekNumber: number): QueueTemplate[] {
  return [
    { templateId: `w${String(weekNumber)}s1`, weekNumber, sessionSlot: 1, sequenceInWeek: 0, priority: 'essential', recoveryTags: ['lowerBodyStrength', 'highImpactStation'], name: 'Strength A + sled' },
    { templateId: `w${String(weekNumber)}s2`, weekNumber, sessionSlot: 2, sequenceInWeek: 1, priority: 'essential', recoveryTags: ['easyRun'], name: 'Easy run + durability' },
    { templateId: `w${String(weekNumber)}s3`, weekNumber, sessionSlot: 3, sequenceInWeek: 2, priority: 'optional', recoveryTags: ['lowImpactAerobic'], name: 'Zone 2' },
    { templateId: `w${String(weekNumber)}s4`, weekNumber, sessionSlot: 4, sequenceInWeek: 3, priority: 'essential', recoveryTags: ['hardRun', 'highImpactStation'], name: 'Quality run' },
    { templateId: `w${String(weekNumber)}s5`, weekNumber, sessionSlot: 5, sequenceInWeek: 4, priority: 'essential', recoveryTags: ['upperBodyStrength', 'hybrid'], name: 'Strength B + stations' },
    { templateId: `w${String(weekNumber)}s6`, weekNumber, sessionSlot: 6, sequenceInWeek: 5, priority: 'important', recoveryTags: ['longRun'], name: 'Long run' },
  ]
}

let eventSeq = 0
export function event(type: ScheduleEventType, templateId: string | null, at: string, payload: Record<string, string | number | boolean | null> = {}): ScheduleEvent {
  eventSeq += 1
  return { id: `ev_${String(eventSeq)}`, at, type, ...(templateId === null ? {} : { instanceId: templateId }), payload }
}

export function input(over: Partial<QueueInput> = {}): QueueInput {
  return {
    planStartDate: PLAN_START, raceDate: RACE_DATE,
    templates: weekTemplates(1), events: [], overrides: [], today: PLAN_START,
    ...over,
  }
}
```

Note: `ScheduleEvent.instanceId` holds the **templateId** in the queue domain — the queue is derived from templates, so template identity is the stable key. The data layer maps between `WorkoutInstance.id` and `templateId` (Task 16).

- [ ] **Step 2: Write the failing recompute test**

`src/domain/queue/__tests__/recompute.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { recomputeQueue } from '../recompute'
import { event, input, PLAN_START, RACE_DATE, weekTemplates } from './recompute.fixtures'

function byId(result: ReturnType<typeof recomputeQueue>, templateId: string) {
  const found = result.instances.find((i) => i.templateId === templateId)
  if (!found) throw new Error(`No instance ${templateId}`)
  return found
}

describe('baseline materialization', () => {
  const r = recomputeQueue(input())

  it('creates one instance per template', () => {
    expect(r.instances).toHaveLength(6)
  })

  it('maps slots to Monday through Saturday of the plan week', () => {
    expect(byId(r, 'w1s1').plannedDate).toBe('2026-08-03')
    expect(byId(r, 'w1s6').plannedDate).toBe('2026-08-08')
  })

  it('leaves Sunday free', () => {
    expect(r.instances.map((i) => i.scheduledDate)).not.toContain('2026-08-09')
  })

  it('schedules every instance on its planned date when nothing has happened', () => {
    expect(r.instances.every((i) => i.scheduledDate === i.plannedDate)).toBe(true)
  })

  it('produces no explanations when nothing moved', () => {
    expect(r.explanations).toEqual([])
  })

  it('marks everything upcoming with no completion date', () => {
    expect(r.instances.every((i) => i.status === 'upcoming' && i.completedForDate === null)).toBe(true)
  })

  it('sorts instances by week then sequence', () => {
    expect(r.instances.map((i) => i.templateId)).toEqual(['w1s1', 'w1s2', 'w1s3', 'w1s4', 'w1s5', 'w1s6'])
  })
})

describe('completion is terminal and dated', () => {
  const r = recomputeQueue(input({
    today: '2026-08-04',
    events: [event('COMPLETE', 'w1s1', '2026-08-03T18:00:00.000Z', { forDate: '2026-08-03' })],
  }))

  it('marks the instance completed', () => {
    expect(byId(r, 'w1s1').status).toBe('completed')
  })

  it('records the date it was completed for', () => {
    expect(byId(r, 'w1s1').completedForDate).toBe('2026-08-03')
  })

  it('does not move a completed instance', () => {
    expect(byId(r, 'w1s1').scheduledDate).toBe('2026-08-03')
  })
})

describe('partial completion is never treated as complete', () => {
  const r = recomputeQueue(input({
    today: '2026-08-04',
    events: [event('PARTIAL', 'w1s1', '2026-08-03T18:00:00.000Z', { forDate: '2026-08-03' })],
  }))

  it('uses the partiallyCompleted status', () => {
    expect(byId(r, 'w1s1').status).toBe('partiallyCompleted')
  })

  it('is terminal, so it is not rescheduled', () => {
    expect(byId(r, 'w1s1').scheduledDate).toBe('2026-08-03')
  })

  it('still occupies its day for eligibility purposes', () => {
    expect(r.instances.filter((i) => i.scheduledDate === '2026-08-03')).toHaveLength(1)
  })
})

describe('missed essential session moves to the next eligible day', () => {
  // Slot 4 (quality run, essential) was never completed; today is two days later.
  const r = recomputeQueue(input({ today: '2026-08-07' }))

  it('does not leave an essential session in the past', () => {
    expect(byId(r, 'w1s4').scheduledDate! >= '2026-08-07').toBe(true)
  })

  it('explains the move in plain language naming the session', () => {
    const text = r.explanations.map((e) => e.text).join(' | ')
    expect(text).toMatch(/Quality run moved to/)
  })

  it('respects the hard-run spacing rule when relocating', () => {
    const quality = byId(r, 'w1s4')
    const neighbours = r.instances.filter((i) =>
      i.templateId !== 'w1s4' && i.recoveryTags.includes('hardRun') && i.scheduledDate !== null)
    for (const n of neighbours) {
      expect(Math.abs(Date.parse(n.scheduledDate!) - Date.parse(quality.scheduledDate!))).toBeGreaterThan(86_400_000)
    }
  })
})

describe('optional sessions drop before essential ones', () => {
  // Only two days remain in week 1 but four sessions are outstanding.
  const r = recomputeQueue(input({ today: '2026-08-07' }))

  it('drops the optional Zone 2 session', () => {
    expect(byId(r, 'w1s3').status).toBe('autoDropped')
  })

  it('gives a dropped session no scheduled date', () => {
    expect(byId(r, 'w1s3').scheduledDate).toBeNull()
  })

  it('records the drop with its priority and reason', () => {
    expect(r.dropped.find((d) => d.templateId === 'w1s3')).toMatchObject({ priority: 'optional' })
  })

  it('explains the drop without punitive language', () => {
    const text = r.explanations.map((e) => e.text).join(' | ')
    expect(text).toMatch(/Optional Zone 2 session dropped/)
    expect(text).not.toMatch(/fail|behind|missed out|should have/i)
  })

  it('keeps every essential session scheduled', () => {
    const essentials = r.instances.filter((i) => i.priority === 'essential')
    expect(essentials.every((i) => i.status !== 'autoDropped')).toBe(true)
  })
})

describe('never two workouts on one day', () => {
  it('places at most one instance per date across two full weeks', () => {
    const r = recomputeQueue(input({
      templates: [...weekTemplates(1), ...weekTemplates(2)], today: '2026-08-12',
    }))
    const dates = r.instances.map((i) => i.scheduledDate).filter((d): d is string => d !== null)
    expect(new Set(dates).size).toBe(dates.length)
  })
})

describe('one rest day per rolling seven days', () => {
  it('never fills seven consecutive days', () => {
    const r = recomputeQueue(input({
      templates: [...weekTemplates(1), ...weekTemplates(2), ...weekTemplates(3)], today: '2026-08-17',
    }))
    const dates = new Set(r.instances.map((i) => i.scheduledDate).filter((d): d is string => d !== null))
    const sorted = [...dates].sort()
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (first === undefined || last === undefined) throw new Error('no dates')
    for (let start = Date.parse(first); start <= Date.parse(last); start += 86_400_000) {
      let filled = 0
      for (let d = 0; d < 7; d += 1) {
        if (dates.has(new Date(start + d * 86_400_000).toISOString().slice(0, 10))) filled += 1
      }
      expect(filled).toBeLessThanOrEqual(6)
    }
  })
})

describe('no double-workout catch-up', () => {
  it('does not stack two outstanding sessions on the same day even when far behind', () => {
    const r = recomputeQueue(input({
      templates: [...weekTemplates(1), ...weekTemplates(2)], today: '2026-08-14',
    }))
    const counts = new Map<string, number>()
    for (const i of r.instances) {
      if (i.scheduledDate === null) continue
      counts.set(i.scheduledDate, (counts.get(i.scheduledDate) ?? 0) + 1)
    }
    expect([...counts.values()].every((c) => c === 1)).toBe(true)
  })
})

describe('deferral', () => {
  const r = recomputeQueue(input({
    today: '2026-08-03',
    events: [event('DEFER', 'w1s1', '2026-08-03T07:00:00.000Z')],
  }))

  it('moves the deferred session off its planned date', () => {
    expect(byId(r, 'w1s1').scheduledDate).not.toBe('2026-08-03')
  })

  it('does not mark it terminal', () => {
    expect(['deferred', 'upcoming', 'available']).toContain(byId(r, 'w1s1').status)
  })

  it('explains the deferral', () => {
    expect(r.explanations.some((e) => /deferred|moved/i.test(e.text))).toBe(true)
  })
})

describe('skip', () => {
  const r = recomputeQueue(input({
    today: '2026-08-04',
    events: [event('SKIP', 'w1s3', '2026-08-03T07:00:00.000Z')],
  }))

  it('marks the session skipped', () => {
    expect(byId(r, 'w1s3').status).toBe('skipped')
  })

  it('gives it no scheduled date', () => {
    expect(byId(r, 'w1s3').scheduledDate).toBeNull()
  })

  it('does not reschedule a skipped session', () => {
    expect(r.explanations.some((e) => e.templateId === 'w1s3' && /moved to/i.test(e.text))).toBe(false)
  })
})

describe('backdated completion (COMPLETE_EARLIER)', () => {
  const events = [event('COMPLETE_EARLIER', 'w1s2', '2026-08-06T20:00:00.000Z', { forDate: '2026-08-04' })]
  const r = recomputeQueue(input({ today: '2026-08-06', events }))

  it('records the prior date the work was done', () => {
    expect(byId(r, 'w1s2').completedForDate).toBe('2026-08-04')
  })

  it('marks it completed', () => {
    expect(byId(r, 'w1s2').status).toBe('completed')
  })

  it('treats the backdated day as occupied so nothing else lands there', () => {
    expect(r.instances.filter((i) => i.scheduledDate === '2026-08-04')).toHaveLength(1)
  })

  it('returns future recommendations to their correct positions', () => {
    const strengthB = byId(r, 'w1s5')
    expect(strengthB.scheduledDate! >= '2026-08-06').toBe(true)
  })

  it('duplicates nothing', () => {
    expect(new Set(r.instances.map((i) => i.templateId)).size).toBe(r.instances.length)
  })

  it('is idempotent — recomputing yields the identical result', () => {
    expect(recomputeQueue(input({ today: '2026-08-06', events }))).toEqual(r)
  })
})

describe('manual override', () => {
  const events = [event('MOVE', 'w1s6', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-09' })]

  it('honours the requested date', () => {
    const r = recomputeQueue(input({ today: '2026-08-03', events, overrides: [{ id: 'ov1', instanceId: 'w1s6', date: '2026-08-09', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' }] }))
    expect(byId(r, 'w1s6').scheduledDate).toBe('2026-08-09')
    expect(byId(r, 'w1s6').isManualOverride).toBe(true)
  })

  it('routes other sessions around a pinned day', () => {
    const r = recomputeQueue(input({
      today: '2026-08-05', events,
      overrides: [{ id: 'ov1', instanceId: 'w1s6', date: '2026-08-09', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' }],
    }))
    const others = r.instances.filter((i) => i.templateId !== 'w1s6' && i.scheduledDate !== null)
    expect(others.every((i) => i.scheduledDate !== '2026-08-09')).toBe(true)
  })

  it('survives a later recomputation triggered by an unrelated completion', () => {
    const withCompletion = [...events, event('COMPLETE', 'w1s1', '2026-08-03T18:00:00.000Z', { forDate: '2026-08-03' })]
    const r = recomputeQueue(input({
      today: '2026-08-04', events: withCompletion,
      overrides: [{ id: 'ov1', instanceId: 'w1s6', date: '2026-08-09', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' }],
    }))
    expect(byId(r, 'w1s6').scheduledDate).toBe('2026-08-09')
  })

  it('allows a manual move that violates a hard conflict but records it as a soft conflict note', () => {
    const r = recomputeQueue(input({
      today: '2026-08-03',
      events: [event('MOVE', 'w1s4', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-04' })],
      overrides: [{ id: 'ov2', instanceId: 'w1s4', date: '2026-08-04', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' }],
    }))
    expect(byId(r, 'w1s4').scheduledDate).toBe('2026-08-04')
  })
})

describe('race date anchoring', () => {
  it('never schedules past the race date', () => {
    const templates = Array.from({ length: 6 }, (_, w) => weekTemplates(w + 1)).flat()
    const r = recomputeQueue(input({ templates, today: PLAN_START, raceDate: '2026-08-22' }))
    for (const i of r.instances) {
      if (i.scheduledDate !== null) expect(i.scheduledDate <= '2026-08-22').toBe(true)
    }
  })

  it('drops rather than extends when the race date is close', () => {
    const templates = Array.from({ length: 6 }, (_, w) => weekTemplates(w + 1)).flat()
    const r = recomputeQueue(input({ templates, today: PLAN_START, raceDate: '2026-08-22' }))
    expect(r.dropped.length).toBeGreaterThan(0)
  })

  it('drops optional sessions before important ones', () => {
    const templates = Array.from({ length: 6 }, (_, w) => weekTemplates(w + 1)).flat()
    const r = recomputeQueue(input({ templates, today: PLAN_START, raceDate: '2026-08-22' }))
    const droppedPriorities = new Set(r.dropped.map((d) => d.priority))
    if (droppedPriorities.has('important')) expect(droppedPriorities.has('optional')).toBe(true)
  })

  it('never drops an essential session while an optional one survives', () => {
    const templates = Array.from({ length: 6 }, (_, w) => weekTemplates(w + 1)).flat()
    const r = recomputeQueue(input({ templates, today: PLAN_START, raceDate: '2026-08-22' }))
    const survivingOptional = r.instances.some((i) => i.priority === 'optional' && i.scheduledDate !== null)
    const droppedEssential = r.instances.some((i) => i.priority === 'essential' && i.status === 'autoDropped')
    expect(droppedEssential && survivingOptional).toBe(false)
  })
})

describe('reset schedule recommendations', () => {
  const events = [
    event('COMPLETE', 'w1s1', '2026-08-03T18:00:00.000Z', { forDate: '2026-08-03' }),
    event('MOVE', 'w1s6', '2026-08-04T09:00:00.000Z', { toDate: '2026-08-09' }),
    event('RESET_RECOMMENDATIONS', null, '2026-08-05T09:00:00.000Z'),
  ]
  const r = recomputeQueue(input({ today: '2026-08-05', events }))

  it('preserves completions recorded before the reset', () => {
    expect(byId(r, 'w1s1').status).toBe('completed')
    expect(byId(r, 'w1s1').completedForDate).toBe('2026-08-03')
  })

  it('discards moves recorded before the reset', () => {
    expect(byId(r, 'w1s6').isManualOverride).toBe(false)
  })

  it('deletes no history', () => {
    expect(r.instances).toHaveLength(6)
  })
})

describe('determinism and purity', () => {
  it('is unaffected by event array order', () => {
    const a = [
      event('COMPLETE', 'w1s1', '2026-08-03T18:00:00.000Z', { forDate: '2026-08-03' }),
      event('SKIP', 'w1s3', '2026-08-04T07:00:00.000Z'),
    ]
    const forward = recomputeQueue(input({ today: '2026-08-05', events: a }))
    const reversed = recomputeQueue(input({ today: '2026-08-05', events: [...a].reverse() }))
    expect(reversed).toEqual(forward)
  })

  it('does not mutate its input', () => {
    const i = input({ today: '2026-08-05', events: [event('SKIP', 'w1s3', '2026-08-04T07:00:00.000Z')] })
    const snapshot = structuredClone(i)
    recomputeQueue(i)
    expect(i).toEqual(snapshot)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:run -- src/domain/queue/__tests__/recompute.test.ts`
Expected: FAIL — `../recompute` not found.

- [ ] **Step 4: Implement explanation copy**

`src/domain/queue/explain.ts` — pure copy builders, neutral tone, no streaks or guilt:

```ts
export function movedExplanation(name: string, toDate: ISODate, cause: string): string
// -> 'Quality run moved to Thursday 6 Aug because Tuesday was missed.'
export function droppedExplanation(name: string, priority: Priority, cause: string): string
// -> 'Optional Zone 2 session dropped to preserve recovery.'
export function deferredExplanation(name: string, toDate: ISODate): string
export function backdatedExplanation(name: string, movedName: string): string
// -> 'Strength A moved after your backdated Tuesday run was recorded.'
export function weekdayName(date: ISODate): string   // 'Monday'..'Sunday', UTC, pure
export function shortDate(date: ISODate): string     // '6 Aug'
```

Do not use `toLocaleDateString` — it is locale- and environment-dependent and would make tests flaky. Use exported `WEEKDAY_NAMES` and `MONTH_ABBREVIATIONS` arrays and index them from the pure date helpers.

- [ ] **Step 5: Implement recomputation**

`src/domain/queue/recompute.ts`. Keep it under 250 lines by extracting the phases into small local functions.

1. `materialize(templates, planStartDate)` → `ScheduledInstance[]` with `plannedDate` from `SLOT_DAY_OFFSET`, `scheduledDate = plannedDate`, `status: 'upcoming'`.
2. `sortEvents(events)` → stable sort by `at`, then `id`, so array order cannot change the outcome.
3. Find the last `RESET_RECOMMENDATIONS` event; ignore all `MOVE` and `DEFER` events at or before it, keep everything else.
4. `applyEvents` → sets `status`, `completedForDate`, `isManualOverride`. Status mapping: `COMPLETE`/`COMPLETE_EARLIER` → `completed`; `PARTIAL` → `partiallyCompleted`; `SKIP` → `skipped`; `DEFER` → `deferred`; `MOVE` → keeps status, sets `isManualOverride`.
5. Terminal statuses (`completed`, `partiallyCompleted`, `skipped`, `autoDropped`) freeze. Completed instances keep `scheduledDate = completedForDate`; skipped and dropped get `scheduledDate = null`.
6. Build the `occupied` list from every frozen instance with a date, plus every pinned override.
7. Pinned overrides: set `scheduledDate` from the override, mark `isManualOverride`, add to `occupied`, and **skip eligibility** — a manual move is allowed to violate hard conflicts, recording each violated rule into `softConflicts`.
8. Place the open set. Iterate weeks ascending; within a week iterate by `sequenceInWeek`. For each instance, scan forward from `max(today, plannedDate)` to `raceDate` for the first day where `isDayEligible` returns eligible. On success, set the date, push to `occupied`, and record a `movedExplanation` when the date differs from `plannedDate`.
9. On failure to place, resolve the shortfall: if `priority === 'optional'` → `autoDropped` with a `droppedExplanation`. If `important` → try the following week's days once; if still unplaceable → `autoDropped`. If `essential` → try the following week's days; if still unplaceable, drop that week's lowest-priority *scheduled* session and retry once; only if that also fails does the essential become `autoDropped`, and the explanation says so plainly.
10. Return instances sorted by `(weekNumber, sequence)`.

Never mutate `input` or any array inside it — clone at the boundary.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:run -- src/domain/queue/__tests__/recompute.test.ts`
Expected: PASS, 45 tests.

- [ ] **Step 7: Run the whole domain suite to check nothing regressed**

Run: `npm run test:run -- src/domain`
Expected: PASS.

Run: `npm run lint`
Expected: no errors — in particular no purity-rule violations.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add deterministic workout queue recomputation from immutable plan plus event journal"
```

---

### Task 11: Plan anchoring, Base weeks, and week generation (D1, §19)

**Files:**
- Create: `src/domain/planGeneration/constants.ts`, `src/domain/planGeneration/anchor.ts`, `src/domain/planGeneration/baseWeeks.ts`
- Test: `src/domain/planGeneration/__tests__/anchor.test.ts`, `src/domain/planGeneration/__tests__/baseWeeks.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const PLAN_WEEKS_DEFAULT = 24
  const MAX_GENERATED_BASE_WEEKS = 8

  type AnchorWarning = 'shortPlan' | 'raceInPast' | 'startDeferred'
  interface AnchorResult {
    planStartDate: ISODate         // always a Monday
    raceWeekNumber: number         // the week containing raceDate
    totalWeeks: number             // baseWeeks + coreWeeks
    coreWeeks: number              // 24 unless compressed
    baseWeeks: number              // generated prologue weeks, 0..MAX_GENERATED_BASE_WEEKS
    deferredStartDate: ISODate | null   // set when the gap exceeds what Base weeks can fill
    warnings: AnchorWarning[]
    explanation: string
  }
  anchorPlan(args: { today: ISODate; raceDate: ISODate; coreWeeks?: number }): AnchorResult
  ```

- [ ] **Step 1: Write the failing anchor test**

`src/domain/planGeneration/__tests__/anchor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { anchorPlan } from '../anchor'

const TODAY = '2026-07-27' // a Monday

describe('exactly 24 weeks available', () => {
  // 24 weeks from Mon 2026-07-27 puts race week starting 2027-01-04; race on Sat 2027-01-09
  const r = anchorPlan({ today: TODAY, raceDate: '2027-01-09' })

  it('starts the plan today', () => {
    expect(r.planStartDate).toBe('2026-07-27')
  })

  it('generates no base weeks', () => {
    expect(r.baseWeeks).toBe(0)
  })

  it('keeps all 24 core weeks', () => {
    expect(r.coreWeeks).toBe(24)
    expect(r.totalWeeks).toBe(24)
  })

  it('puts the race in week 24', () => {
    expect(r.raceWeekNumber).toBe(24)
  })

  it('raises no warnings', () => {
    expect(r.warnings).toEqual([])
  })
})

describe('fewer than 24 weeks available', () => {
  const r = anchorPlan({ today: TODAY, raceDate: '2026-11-14' }) // ~16 weeks out

  it('warns that the plan is short', () => {
    expect(r.warnings).toContain('shortPlan')
  })

  it('starts today rather than in the past', () => {
    expect(r.planStartDate).toBe('2026-07-27')
  })

  it('compresses the core weeks to fit', () => {
    expect(r.coreWeeks).toBeLessThan(24)
    expect(r.coreWeeks).toBeGreaterThan(0)
  })

  it('still anchors the race to the final week', () => {
    expect(r.raceWeekNumber).toBe(r.totalWeeks)
  })

  it('explains the compression in plain language', () => {
    expect(r.explanation).toMatch(/fewer than 24 weeks/i)
  })
})

describe('more than 24 weeks available, fillable with base weeks (D1)', () => {
  // ~30 weeks out -> 6 base weeks + 24 core
  const r = anchorPlan({ today: TODAY, raceDate: '2027-02-20' })

  it('starts the plan today so training begins immediately', () => {
    expect(r.planStartDate).toBe('2026-07-27')
  })

  it('generates base weeks to fill the gap', () => {
    expect(r.baseWeeks).toBeGreaterThan(0)
    expect(r.baseWeeks).toBeLessThanOrEqual(8)
  })

  it('keeps all 24 core weeks', () => {
    expect(r.coreWeeks).toBe(24)
  })

  it('anchors the race to the final week', () => {
    expect(r.raceWeekNumber).toBe(r.totalWeeks)
    expect(r.totalWeeks).toBe(r.baseWeeks + 24)
  })

  it('does not defer the start', () => {
    expect(r.deferredStartDate).toBeNull()
    expect(r.warnings).not.toContain('startDeferred')
  })

  it('explains the base weeks', () => {
    expect(r.explanation).toMatch(/base week/i)
  })
})

describe('far more than 24 + 8 weeks available', () => {
  const r = anchorPlan({ today: TODAY, raceDate: '2027-12-04' })

  it('caps base weeks at the maximum', () => {
    expect(r.baseWeeks).toBe(8)
  })

  it('defers the start so the taper still lands on race week', () => {
    expect(r.deferredStartDate).not.toBeNull()
    expect(r.warnings).toContain('startDeferred')
  })

  it('sets the plan start to the deferred date', () => {
    expect(r.planStartDate).toBe(r.deferredStartDate)
  })

  it('explains the countdown', () => {
    expect(r.explanation).toMatch(/begins on/i)
  })
})

describe('plan start is always a Monday', () => {
  it.each(['2026-07-27', '2026-07-28', '2026-07-30', '2026-08-01', '2026-08-02'])(
    'normalizes a today of %s to a Monday start', (today) => {
      const r = anchorPlan({ today, raceDate: '2027-02-20' })
      const day = new Date(`${r.planStartDate}T00:00:00.000Z`).getUTCDay()
      expect(day).toBe(1)
    },
  )
})

describe('race date in the past', () => {
  const r = anchorPlan({ today: TODAY, raceDate: '2026-06-01' })

  it('warns rather than throwing', () => {
    expect(r.warnings).toContain('raceInPast')
  })

  it('produces a usable single-week plan rather than a negative one', () => {
    expect(r.totalWeeks).toBeGreaterThanOrEqual(1)
  })
})

describe('purity', () => {
  it('is deterministic for identical input', () => {
    expect(anchorPlan({ today: TODAY, raceDate: '2027-02-20' }))
      .toEqual(anchorPlan({ today: TODAY, raceDate: '2027-02-20' }))
  })
})
```

- [ ] **Step 2: Write the failing base-weeks test**

`src/domain/planGeneration/__tests__/baseWeeks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateBaseWeeks } from '../baseWeeks'

describe('generateBaseWeeks', () => {
  it('generates no weeks when none are needed', () => {
    expect(generateBaseWeeks(0)).toEqual([])
  })

  it('generates the requested number of weeks', () => {
    expect(generateBaseWeeks(6)).toHaveLength(6)
  })

  it('numbers weeks from one', () => {
    expect(generateBaseWeeks(3).map((w) => w.weekNumber)).toEqual([1, 2, 3])
  })

  it('labels weeks as base weeks', () => {
    expect(generateBaseWeeks(2).every((w) => w.label.toLowerCase().includes('base'))).toBe(true)
  })

  it('gives every base week at least the minimum effective four sessions', () => {
    expect(generateBaseWeeks(4).every((w) => w.templates.length >= 4)).toBe(true)
  })

  it('never exceeds six sessions in a base week', () => {
    expect(generateBaseWeeks(4).every((w) => w.templates.length <= 6)).toBe(true)
  })

  it('includes an easy run, a Zone 2 session, and strength maintenance', () => {
    const week = generateBaseWeeks(1)[0]
    if (!week) throw new Error('no week')
    const tags = week.templates.flatMap((t) => t.recoveryTags)
    expect(tags).toContain('easyRun')
    expect(tags).toContain('lowImpactAerobic')
    expect(tags).toContain('lowerBodyStrength')
  })

  it('marks Zone 2 as optional so it drops first under pressure', () => {
    const week = generateBaseWeeks(1)[0]
    if (!week) throw new Error('no week')
    const zone2 = week.templates.find((t) => t.recoveryTags.includes('lowImpactAerobic'))
    expect(zone2?.priority).toBe('optional')
  })

  it('schedules no hard running in base weeks because the athlete is building durability', () => {
    const tags = generateBaseWeeks(8).flatMap((w) => w.templates.flatMap((t) => t.recoveryTags))
    expect(tags).not.toContain('hardRun')
  })

  it('progresses easy run duration across the base block', () => {
    const weeks = generateBaseWeeks(6)
    const durations = weeks.map((w) => {
      const run = w.templates.find((t) => t.recoveryTags.includes('easyRun'))
      return run?.estMinutes ?? 0
    })
    expect(durations[durations.length - 1]!).toBeGreaterThan(durations[0]!)
  })

  it('produces unique template ids across all weeks', () => {
    const ids = generateBaseWeeks(8).flatMap((w) => w.templates.map((t) => t.templateId))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is deterministic', () => {
    expect(generateBaseWeeks(5)).toEqual(generateBaseWeeks(5))
  })
})
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm run test:run -- src/domain/planGeneration`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`src/domain/planGeneration/constants.ts`:

```ts
/** The shipped plan is 24 weeks (§19). */
export const PLAN_WEEKS_DEFAULT = 24
/** Beyond this many generated prologue weeks the plan start is deferred instead (D1). */
export const MAX_GENERATED_BASE_WEEKS = 8
/** Base-week easy run duration ramp, minutes. Index is the base week, zero-based. */
export const BASE_EASY_RUN_MINUTES = [25, 28, 30, 32, 35, 35, 38, 40]
/** Base-week Zone 2 duration ramp, minutes. */
export const BASE_ZONE2_MINUTES = [30, 32, 35, 35, 38, 40, 40, 42]
```

`src/domain/planGeneration/anchor.ts` — pure. Steps: normalize `today` to its ISO Monday via `startOfIsoWeek`; normalize `raceDate` to its ISO Monday; `weeksAvailable = daysBetween(mondayToday, mondayRace) / 7 + 1`. Then:
- `weeksAvailable < 1` → `raceInPast` warning, `totalWeeks = 1`.
- `weeksAvailable < coreWeeks` → `shortPlan`, `coreWeeks = weeksAvailable`, `baseWeeks = 0`.
- `weeksAvailable === coreWeeks` → no warnings.
- gap = `weeksAvailable - coreWeeks`; `gap <= MAX_GENERATED_BASE_WEEKS` → `baseWeeks = gap`, start today.
- `gap > MAX_GENERATED_BASE_WEEKS` → `baseWeeks = MAX_GENERATED_BASE_WEEKS`, `deferredStartDate = mondayRace - (coreWeeks + MAX_GENERATED_BASE_WEEKS - 1) weeks`, `startDeferred` warning.

`generateBaseWeeks(count)` returns `{ weekNumber, label, isDeload, templates: QueueTemplate[] & { estMinutes: number } }[]` — 5 sessions per base week: Strength A maintenance (essential, `lowerBodyStrength`), easy run + durability (essential, `easyRun`), Zone 2 (optional, `lowImpactAerobic`), Strength B maintenance (essential, `upperBodyStrength`), long easy run (important, `longRun`). Durations index the ramp arrays, clamped to the last entry. Template ids are `base_w{n}_s{slot}`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/domain/planGeneration`
Expected: PASS, 30 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: anchor the plan to race week and generate editable base weeks"
```

---

### Task 12: Goal-derived milestones and trajectory (§18, D15)

**Files:**
- Create: `src/domain/milestones/constants.ts`, `src/domain/milestones/goalTargets.ts`, `src/domain/milestones/evaluate.ts`, `src/domain/milestones/trajectory.ts`
- Test: `src/domain/milestones/__tests__/goalTargets.test.ts`, `src/domain/milestones/__tests__/evaluate.test.ts`, `src/domain/milestones/__tests__/trajectory.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const STATION_AND_ROXZONE_BUDGET_SEC = 2520
  const COMPROMISED_PENALTY_SEC_PER_KM = 45

  interface GoalTargets {
    targetSeconds: number
    compromisedKmTargetSec: number
    standalone5kTargetSec: number
    runBudgetSec: number
  }
  goalTargets(targetSeconds: number, opts?: { stationBudgetSec?: number; penaltySecPerKm?: number }): GoalTargets

  interface MilestoneEvidence { label: string; value: string; target: string; met: boolean }
  interface MilestoneResult {
    key: MilestoneKey
    label: string
    status: MilestoneStatus
    targetWeek: number
    evidence: MilestoneEvidence[]
  }
  interface MilestoneFacts {
    currentWeek: number
    totalWeeks: number
    weeksWithFourPlusSessions: number
    weeklyRunKm: { weekNumber: number; km: number }[]
    longestContinuousRunKm: number
    best5kSeconds: number | null
    compromisedKmMeanSec: number | null
    compromisedKmCount: number
    raceLoadSledSessions: number
    hundredWallBallSessions: number
    halfSimulationDone: boolean
    seventyFiveSimulationDone: boolean
    fullRehearsalDone: boolean
    symptomsFlagged: boolean
  }
  evaluateMilestones(facts: MilestoneFacts, targets: GoalTargets): MilestoneResult[]

  interface TrajectoryResult { trajectory: Trajectory; headline: string; evidence: string[] }
  computeTrajectory(results: MilestoneResult[], facts: Pick<MilestoneFacts, 'currentWeek' | 'totalWeeks' | 'symptomsFlagged'>): TrajectoryResult

  interface RaceEstimate { lowSeconds: number; highSeconds: number } | null
  estimateRaceRange(facts: MilestoneFacts, targets: GoalTargets): RaceEstimate
  ```

- [ ] **Step 1: Write the failing goal-targets test**

`src/domain/milestones/__tests__/goalTargets.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { goalTargets } from '../goalTargets'

describe('goalTargets', () => {
  it('derives a 6:00/km compromised target for a sub-1:30 goal, matching the brief', () => {
    expect(goalTargets(5400).compromisedKmTargetSec).toBe(360)
  })

  it('derives the default 1:35 targets', () => {
    const t = goalTargets(5700)
    expect(t.compromisedKmTargetSec).toBeCloseTo(397.5, 1)
    expect(t.standalone5kTargetSec).toBeCloseTo(1762.5, 1)
  })

  it('derives 1:40 targets', () => {
    const t = goalTargets(6000)
    expect(t.compromisedKmTargetSec).toBe(435)
    expect(t.standalone5kTargetSec).toBe(1950)
  })

  it('keeps the sub-1:30 5k target within the brief-stated 26:00-28:00 band (sanity bound)', () => {
    const t = goalTargets(5400)
    expect(t.standalone5kTargetSec).toBeGreaterThanOrEqual(1560)
    expect(t.standalone5kTargetSec).toBeLessThanOrEqual(1680)
  })

  it('reports the run budget', () => {
    expect(goalTargets(5700).runBudgetSec).toBe(3180)
  })

  it('recalculates when the goal changes', () => {
    expect(goalTargets(5400).standalone5kTargetSec).toBeLessThan(goalTargets(6000).standalone5kTargetSec)
  })

  it('honours an overridden station budget', () => {
    expect(goalTargets(5700, { stationBudgetSec: 2400 }).compromisedKmTargetSec).toBeCloseTo(412.5, 1)
  })

  it('honours an overridden compromised penalty', () => {
    expect(goalTargets(5700, { penaltySecPerKm: 30 }).standalone5kTargetSec).toBeCloseTo(1837.5, 1)
  })

  it('clamps to a positive run budget for an impossibly fast goal', () => {
    const t = goalTargets(1000)
    expect(t.compromisedKmTargetSec).toBeGreaterThan(0)
    expect(t.standalone5kTargetSec).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Write the failing milestone and trajectory tests**

`src/domain/milestones/__tests__/evaluate.test.ts` — build a `facts` factory defaulting everything to "nothing achieved", then assert:
- all twelve keys are returned, in a stable order
- `standalone5k` is `achieved` when `best5kSeconds <= targets.standalone5kTargetSec`, `inProgress` when a time exists but is slower, `notStarted` when `null`
- `compromisedKmSet` requires **both** `compromisedKmCount >= 6` **and** `compromisedKmMeanSec <= targets.compromisedKmTargetSec`; five qualifying efforts is `inProgress`
- `longestContinuousRun` targets 12 km and reports the current value in its evidence
- `comfortable10k` is achieved once `longestContinuousRunKm >= 10`
- `fourWorkoutWeeks` is achieved at `weeksWithFourPlusSessions >= 4` consecutive-equivalent count, `inProgress` below
- `symptomsManageable` is `atRisk` when `symptomsFlagged` is true, `achieved` otherwise
- `halfSimulation` / `seventyFiveSimulation` / `fullRehearsal` map their booleans, with `targetWeek` 12, 18, and 21 respectively
- every result carries at least one evidence row whose `target` is a formatted string, never an empty string
- a milestone whose `targetWeek` has passed without achievement is `atRisk`, not merely `inProgress`
- the function does not mutate `facts`

`src/domain/milestones/__tests__/trajectory.test.ts` — assert:
- all milestones met and `currentWeek` early → `'ahead'`
- met count equal to expected-by-week → `'onTrack'`
- one short → `'slightlyBehind'`
- several short → `'needsAttention'`
- `symptomsFlagged` caps the result at `'slightlyBehind'` even when every other milestone is met, and the evidence names the symptom cap
- `evidence` is never empty and always names specific milestones rather than a bare label
- `headline` contains no predicted finishing time
- `estimateRaceRange` returns `null` unless a 5 km benchmark, a compromised-km mean, **and** `seventyFiveSimulationDone` all exist; when it does return a range, `lowSeconds < highSeconds` and both are positive
- `estimateRaceRange` is `null` when only two of the three inputs exist (three separate cases)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:run -- src/domain/milestones`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`src/domain/milestones/constants.ts`:

```ts
/**
 * Eight stations (~32-36 min) plus roxzone transitions (~7-8 min). Validated by
 * the fact that a 1:30 goal then derives exactly the brief's 6:00/km
 * compromised target. Editable in Settings.
 */
export const STATION_AND_ROXZONE_BUDGET_SEC = 2520
/**
 * How much slower a race kilometre runs than a fresh 5 km kilometre. The brief's
 * sub-1:30 pairing implies ~30 s/km, which is optimistic for a first race, so 45
 * is used — the stricter direction for a goal-setting tool. Editable in Settings.
 */
export const COMPROMISED_PENALTY_SEC_PER_KM = 45
/** Race distance: eight 1 km runs. */
export const RACE_RUN_KM = 8
export const BENCHMARK_5K_KM = 5
/** Durability targets, independent of goal pace. */
export const LONGEST_RUN_TARGET_KM = 12
export const COMFORTABLE_10K_KM = 10
export const COMPROMISED_KM_REQUIRED_COUNT = 6
export const FOUR_WORKOUT_WEEKS_REQUIRED = 4
/** Plan weeks by which each simulation milestone should be met (§19, D4). */
export const MILESTONE_TARGET_WEEKS = {
  halfSimulation: 12, seventyFiveSimulation: 18, fullRehearsal: 21,
} as const
```

`goalTargets.ts` implements the two formulas from the spec §4.6 with a `Math.max(1, ...)` clamp on the run budget. `evaluate.ts` is twelve small pure predicates plus evidence formatting. `trajectory.ts` computes `expectedByNow = round(totalMilestones * currentWeek / totalWeeks)`, compares to the met count, maps the delta to a `Trajectory`, and applies the symptom cap. `estimateRaceRange` requires all three inputs and returns a ±4% band around a projection built from the observed compromised mean plus the station budget — labelled by the UI as an estimate, never a point value.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/domain/milestones`
Expected: PASS.

- [ ] **Step 6: Run the whole domain suite and the gates**

Run: `npm run test:run -- src/domain`
Expected: PASS.

Run: `npm run lint`; Run: `npm run typecheck`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: derive running milestones from the race goal and compute trajectory"
```

---

# Phase 2 — Data layer

### Task 13: Dexie database, schema, migrations, and the immutability guard

**Files:**
- Create: `src/data/schema.ts`, `src/data/db.ts`, `src/data/errors.ts`, `src/data/migrations/index.ts`, `src/data/migrations/v1.ts`, `src/data/repositories/guard.ts`
- Test: `src/data/__tests__/db.test.ts`, `src/data/__tests__/migrations.test.ts`, `src/data/__tests__/guard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const SCHEMA_VERSION = 1
  class HyroxDb extends Dexie { /* one Table<T, string> property per entity */ }
  const db: HyroxDb

  type DbFailureKind = 'quotaExceeded' | 'upgradeBlocked' | 'accessDenied' | 'unknown'
  class DbUnavailableError extends Error { readonly kind: DbFailureKind; readonly cause?: unknown }
  class HistoryImmutableError extends Error { readonly entity: string; readonly id: string }

  openDb(): Promise<HyroxDb>                     // rejects with DbUnavailableError
  classifyDbError(err: unknown): DbFailureKind
  assertMutable(instance: Pick<WorkoutInstance, 'id' | 'frozen'>, opts?: { allowHistoryEdit?: boolean }): void
  resetDatabase(): Promise<void>                  // used only by Settings reset and tests
  ```

- [ ] **Step 1: Write the failing guard test**

`src/data/__tests__/guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HistoryImmutableError } from '../errors'
import { assertMutable } from '../repositories/guard'

describe('assertMutable', () => {
  it('permits writes to an unfrozen instance', () => {
    expect(() => { assertMutable({ id: 'wi_1', frozen: false }) }).not.toThrow()
  })

  it('rejects writes to a frozen instance', () => {
    expect(() => { assertMutable({ id: 'wi_1', frozen: true }) }).toThrow(HistoryImmutableError)
  })

  it('names the offending record so the error is actionable', () => {
    try {
      assertMutable({ id: 'wi_42', frozen: true })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(HistoryImmutableError)
      expect((err as HistoryImmutableError).id).toBe('wi_42')
    }
  })

  it('permits writes to a frozen instance only via an explicit history edit', () => {
    expect(() => { assertMutable({ id: 'wi_1', frozen: true }, { allowHistoryEdit: true }) }).not.toThrow()
  })
})
```

- [ ] **Step 2: Write the failing database and migration tests**

`src/data/__tests__/db.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { db, openDb, resetDatabase, SCHEMA_VERSION } from '../db'
import { classifyDbError } from '../errors'

beforeEach(async () => { await resetDatabase() })

describe('openDb', () => {
  it('opens at the current schema version', async () => {
    const opened = await openDb()
    expect(opened.verno).toBe(SCHEMA_VERSION)
  })

  it('exposes every declared table', async () => {
    await openDb()
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual([
      'athleteProfile', 'exercises', 'hyroxStandards', 'instancePrescriptions',
      'intervalSplits', 'milestoneState', 'planPhases', 'planWeeks', 'plans',
      'prescriptions', 'raceGoals', 'restTimerState', 'runLogs', 'safetyBackups',
      'scheduleEvents', 'scheduleOverrides', 'queueExplanations', 'settings',
      'stationLogs', 'strengthSets', 'symptomLogs', 'workoutInstances', 'workoutTemplates',
    ].sort())
  })

  it('round-trips a record', async () => {
    await openDb()
    await db.exercises.put({
      id: 'ex_1', name: 'Back squat', category: 'squat', measurementType: 'strengthSets',
      loadStyle: 'totalBarbell', defaultUnit: 'lb', defaultRestSec: 150,
      progressionIncrement: 5, incrementUnit: 'lb', defaultSets: 4, repMin: 4, repMax: 6,
      techniqueNotes: '', isArchived: false, isSeeded: true,
      createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
    })
    expect((await db.exercises.get('ex_1'))?.name).toBe('Back squat')
  })

  it('is idempotent when called twice', async () => {
    await openDb()
    await expect(openDb()).resolves.toBeDefined()
  })
})

describe('classifyDbError', () => {
  it('recognizes a quota error', () => {
    expect(classifyDbError(new DOMException('full', 'QuotaExceededError'))).toBe('quotaExceeded')
  })

  it('recognizes a blocked upgrade', () => {
    expect(classifyDbError({ name: 'VersionError' })).toBe('upgradeBlocked')
  })

  it('recognizes denied access', () => {
    expect(classifyDbError(new DOMException('nope', 'SecurityError'))).toBe('accessDenied')
  })

  it('falls back to unknown', () => {
    expect(classifyDbError(new Error('something else'))).toBe('unknown')
  })

  it('does not throw on a null input', () => {
    expect(classifyDbError(null)).toBe('unknown')
  })
})
```

`src/data/__tests__/migrations.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { openDb, resetDatabase, SCHEMA_VERSION } from '../db'
import { MIGRATIONS } from '../migrations'

describe('migration chain', () => {
  it('declares one entry per schema version with no gaps', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(
      Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1),
    )
  })

  it('preserves rows written under v1 when reopened through the chain', async () => {
    await resetDatabase()
    // Write through a bare v1 handle, mimicking data created by an earlier release.
    const legacy = new Dexie('hyrox-training')
    legacy.version(1).stores({ exercises: 'id, name, category, isArchived' })
    await legacy.open()
    await legacy.table('exercises').put({ id: 'ex_legacy', name: 'Legacy lift', category: 'squat' })
    legacy.close()

    const upgraded = await openDb()
    const row = await upgraded.exercises.get('ex_legacy')
    expect(row?.name).toBe('Legacy lift')
  })

  it('does not drop unrelated tables during an upgrade', async () => {
    const upgraded = await openDb()
    expect(upgraded.tables.length).toBeGreaterThan(20)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:run -- src/data`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement schema, db, errors, migrations, guard**

`src/data/schema.ts` — exports `SCHEMA_VERSION = 1` and a `STORES_V1` record mapping each table name to its Dexie index string. Indexes: primary key `id` everywhere, plus
`exercises: 'id, name, category, isArchived, isSeeded'`,
`workoutInstances: 'id, planId, templateId, status, scheduledDate, plannedDate, weekNumber, [planId+weekNumber], [status+scheduledDate]'`,
`instancePrescriptions: 'id, instanceId, exerciseId, [instanceId+order]'`,
`strengthSets: 'id, instanceId, exerciseId, instancePrescriptionId, completedAt, [instanceId+setIndex], [exerciseId+completedAt]'`,
`runLogs: 'id, instanceId, runType, loggedAt'`,
`intervalSplits: 'id, runLogId, [runLogId+index]'`,
`stationLogs: 'id, instanceId, station'`,
`symptomLogs: 'id, instanceId, forDate'`,
`scheduleEvents: 'id, at, type, instanceId'`,
`scheduleOverrides: 'id, instanceId, date'`,
`queueExplanations: 'id, instanceId, weekNumber, at'`,
`prescriptions: 'id, templateId, exerciseId, [templateId+order]'`,
`workoutTemplates: 'id, planId, planWeekId, sessionSlot, priority'`,
`planWeeks: 'id, planId, weekNumber, phaseId'`, `planPhases: 'id, planId'`,
`plans: 'id, status'`, `raceGoals: 'id, isActive'`, `hyroxStandards: 'id, station, order'`,
`milestoneState: 'id, key'`, and single-row tables `settings: 'id'`, `athleteProfile: 'id'`, `restTimerState: 'id'`, `safetyBackups: 'id'`.

`src/data/errors.ts` — `DbUnavailableError`, `HistoryImmutableError`, `classifyDbError`. Classification maps `QuotaExceededError` → `quotaExceeded`; `VersionError` / `UpgradeError` / `DatabaseClosedError` → `upgradeBlocked`; `SecurityError` / `InvalidStateError` → `accessDenied`; anything else `unknown`. Must handle `null`/`undefined`/non-objects without throwing.

`src/data/db.ts` — a single `HyroxDb extends Dexie` with typed `Table<T, string>` properties, the migration chain applied in `MIGRATIONS` order, `openDb()` wrapping `db.open()` in try/catch and rethrowing `DbUnavailableError` with the classified kind, and `resetDatabase()` deleting and recreating (test + Settings reset only).

`src/data/migrations/v1.ts` exports `{ version: 1, stores: STORES_V1 }`. `src/data/migrations/index.ts` exports `MIGRATIONS` as a readonly ordered array.

`src/data/repositories/guard.ts` — `assertMutable` per the test contract.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/data`
Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Dexie schema, migration chain, and history immutability guard"
```

---

### Task 14: Seed the exercise library and HYROX standards (§11, §13)

**Files:**
- Create: `src/data/seed/exercises.ts`, `src/data/seed/hyroxStandards.ts`, `src/data/seed/seedRunner.ts`
- Test: `src/data/seed/__tests__/exercises.test.ts`, `src/data/seed/__tests__/hyroxStandards.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const SEED_EXERCISES: readonly Exercise[]
  const SEED_HYROX_STANDARDS: readonly HyroxStandard[]
  seedIfEmpty(db: HyroxDb, now: ISOInstant): Promise<{ exercises: number; standards: number }>
  ```

- [ ] **Step 1: Write the failing standards test**

`src/data/seed/__tests__/hyroxStandards.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SEED_HYROX_STANDARDS } from '../hyroxStandards'

describe('HYROX Men\'s Open standards seed', () => {
  it('covers all eight stations in race order', () => {
    expect(SEED_HYROX_STANDARDS.map((s) => s.station)).toEqual([
      'skiErg', 'sledPush', 'sledPull', 'burpeeBroadJump',
      'row', 'farmerCarry', 'sandbagLunge', 'wallBalls',
    ])
  })

  it.each([
    ['skiErg', { distanceM: 1000 }],
    ['sledPush', { distanceM: 50, loadKg: 152 }],
    ['sledPull', { distanceM: 50, loadKg: 103 }],
    ['burpeeBroadJump', { distanceM: 80 }],
    ['row', { distanceM: 1000 }],
    ['farmerCarry', { distanceM: 200, loadPerHandKg: 24 }],
    ['sandbagLunge', { distanceM: 100, loadKg: 20 }],
    ['wallBalls', { reps: 100, ballKg: 6, targetHeightM: 3.0 }],
  ])('seeds %s correctly', (station, expected) => {
    const s = SEED_HYROX_STANDARDS.find((x) => x.station === station)
    expect(s).toMatchObject(expected)
  })

  it('marks every standard as seeded so it can be restored', () => {
    expect(SEED_HYROX_STANDARDS.every((s) => s.isSeeded)).toBe(true)
  })

  it('is editable configuration, not frozen constants', () => {
    // Every standard must carry an id so the user can persist an edited copy.
    expect(SEED_HYROX_STANDARDS.every((s) => typeof s.id === 'string' && s.id.length > 0)).toBe(true)
  })

  it('notes the overhead clearance requirement on wall balls', () => {
    const wb = SEED_HYROX_STANDARDS.find((s) => s.station === 'wallBalls')
    expect(wb?.notes).toMatch(/overhead clearance/i)
  })

  it('notes that sled friction varies between venues', () => {
    const push = SEED_HYROX_STANDARDS.find((s) => s.station === 'sledPush')
    expect(push?.notes).toMatch(/friction/i)
  })

  it('uses unique ids', () => {
    expect(new Set(SEED_HYROX_STANDARDS.map((s) => s.id)).size).toBe(SEED_HYROX_STANDARDS.length)
  })
})
```

- [ ] **Step 2: Write the failing exercise-library test**

`src/data/seed/__tests__/exercises.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SEED_EXERCISES } from '../exercises'

const byName = (name: string) => SEED_EXERCISES.find((e) => e.name === name)

describe('exercise library seed', () => {
  it('has unique ids and unique names', () => {
    expect(new Set(SEED_EXERCISES.map((e) => e.id)).size).toBe(SEED_EXERCISES.length)
    expect(new Set(SEED_EXERCISES.map((e) => e.name)).size).toBe(SEED_EXERCISES.length)
  })

  it('includes every exercise the 24-week plan prescribes', () => {
    for (const name of [
      'Back squat', 'Romanian deadlift', 'Split squat', 'Bench press',
      'Lat pulldown', 'Pull-up', 'Walking lunge', 'Pallof press', 'Side plank',
      'Sled push', 'Sled pull', 'Farmer carry', 'Burpee broad jump',
      'SkiErg', 'Row', 'Sandbag lunge', 'Wall ball',
      'Straight-knee calf raise', 'Bent-knee calf raise', 'Tibialis raise',
      'Easy run', 'Long run', 'Quality run', 'Compromised run',
    ]) {
      expect(byName(name), `missing seeded exercise: ${name}`).toBeDefined()
    }
  })

  it.each([
    ['Back squat', 150], ['Romanian deadlift', 120], ['Bench press', 120],
    ['Split squat', 90], ['Walking lunge', 90], ['Sled push', 90],
    ['Sled pull', 90], ['Farmer carry', 90], ['Wall ball', 60],
    ['Burpee broad jump', 60], ['Pallof press', 45], ['Lat pulldown', 60],
  ])('seeds the %s rest default at %i seconds', (name, restSec) => {
    expect(byName(name)?.defaultRestSec).toBe(restSec)
  })

  it('gives standard barbell lifts a 5 lb increment', () => {
    for (const name of ['Back squat', 'Romanian deadlift', 'Bench press']) {
      expect(byName(name)).toMatchObject({ progressionIncrement: 5, incrementUnit: 'lb' })
    }
  })

  it('gives station exercises a zero increment so they never auto-progress', () => {
    for (const name of ['Sled push', 'Sled pull', 'Farmer carry', 'Sandbag lunge', 'Wall ball']) {
      expect(byName(name)?.progressionIncrement).toBe(0)
    }
  })

  it('defaults station loads to kilograms to match competition standards', () => {
    for (const name of ['Sled push', 'Sled pull', 'Farmer carry', 'Sandbag lunge', 'Wall ball']) {
      expect(byName(name)?.defaultUnit).toBe('kg')
    }
  })

  it('defaults barbell loads to pounds', () => {
    expect(byName('Back squat')?.defaultUnit).toBe('lb')
  })

  it('uses per-dumbbell load style for the split squat', () => {
    expect(byName('Split squat')?.loadStyle).toBe('perDumbbell')
  })

  it('uses body weight load style for walking lunges', () => {
    expect(byName('Walking lunge')?.loadStyle).toBe('bodyWeight')
  })

  it('categorizes the calf and tibialis work so it is never symptom-gated', () => {
    for (const name of ['Straight-knee calf raise', 'Bent-knee calf raise', 'Tibialis raise']) {
      expect(byName(name)?.category).toBe('calf')
    }
  })

  it('marks every seeded exercise active and seeded', () => {
    expect(SEED_EXERCISES.every((e) => !e.isArchived && e.isSeeded)).toBe(true)
  })

  it('gives run exercises a distance or duration measurement type', () => {
    for (const name of ['Easy run', 'Long run', 'Quality run', 'Compromised run']) {
      expect(['distance', 'duration', 'pace']).toContain(byName(name)?.measurementType)
    }
  })

  it('carries technique notes on the technical stations', () => {
    for (const name of ['Wall ball', 'Sled push', 'Burpee broad jump', 'Sandbag lunge']) {
      expect(byName(name)?.techniqueNotes.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm run test:run -- src/data/seed`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the seeds**

Write `SEED_HYROX_STANDARDS` and `SEED_EXERCISES` as `as const satisfies readonly Exercise[]` arrays with stable `id`s of the form `ex_back_squat`, `std_sled_push`. Every field from the type must be present — the typecheck is the completeness gate. Add all exercises the plan needs plus reasonable accessories (Pallof press, side plank, plank, hip thrust, seated row, overhead press, box step-up, sled drag), each with a category, measurement type, load style, default unit, rest default, increment, default sets/reps, and technique notes where the movement is technical.

`seedRunner.ts` — `seedIfEmpty` inserts only when the respective table has `count() === 0`, inside a single Dexie transaction, using `bulkPut`. It never overwrites user edits and never deletes rows.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/data/seed`
Expected: PASS, 30 tests.

Run: `npm run typecheck`
Expected: clean — this is what proves every seed row satisfies `Exercise` and `HyroxStandard`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: seed the exercise library and editable HYROX Men's Open standards"
```

---

### Task 15: Seed the 24-week plan (§19)

**Files:**
- Create: `src/data/seed/plan24Week/phases.ts`, `src/data/seed/plan24Week/strengthTemplates.ts`, `src/data/seed/plan24Week/runProgression.ts`, `src/data/seed/plan24Week/weeks.ts`, `src/data/seed/plan24Week/index.ts`
- Test: `src/data/seed/plan24Week/__tests__/weeks.test.ts`, `src/data/seed/plan24Week/__tests__/priorities.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const SEED_PHASES: readonly { name: string; weekStart: number; weekEnd: number; focus: string }[]
  interface SeedPrescription { exerciseId: string; order: number; sets?: number; repMin?: number; repMax?: number; targetLoad?: number; loadUnit?: Unit; loadStyle?: LoadStyle; distanceM?: number; durationSec?: number; targetPaceSecPerKm?: number; paceSource?: PaceSource; restSec: number; intervalSpec?: IntervalSpec; notes?: string }
  interface SeedTemplate { sessionSlot: number; sequenceInWeek: number; name: string; kind: WorkoutKind; priority: Priority; recoveryTags: RecoveryTag[]; estMinutes: number; notes?: string; stationVolumePct?: number; prescriptions: SeedPrescription[] }
  interface SeedWeek { weekNumber: number; phaseName: string; label: string; isDeload: boolean; notes?: string; templates: SeedTemplate[] }
  const SEED_WEEKS_24: readonly SeedWeek[]
  ```

- [ ] **Step 1: Write the failing structural test**

`src/data/seed/plan24Week/__tests__/weeks.test.ts` — assertions:
- exactly 24 weeks, numbered 1..24 with no gaps
- every week has between 4 and 6 templates (D5), and weeks 12, 16, 18, 21, 24 have fewer than 6
- every week has at least `MIN_EFFECTIVE_WEEK_SESSIONS` templates
- `sessionSlot` values within a week are unique and in 1..6; `sequenceInWeek` is 0-based and contiguous
- every `prescriptions[].exerciseId` resolves against `SEED_EXERCISES` (this is the test that catches typos)
- every prescription has a positive `restSec`
- phases cover weeks 1–24 contiguously with no overlap: Base 1–6, Build 7–12, Race-specific 13–18, Specific prep 19–22, Taper 23–24
- week 4 and week 8 are marked `isDeload`
- week 12 contains a `benchmark` 5 km run and a `simulation` template
- week 18 contains a `simulation` template with `stationVolumePct === 75`
- week 21 contains a `simulation` template with `stationVolumePct === 100` and its notes say the rehearsal is controlled, not all-out (D4)
- weeks 19, 20, 22, 23 contain **no** `simulation` template (simulations are never weekly)
- week 24 contains a `race` template
- `stationVolumePct` is non-decreasing across weeks 13→21 except for the week 16 consolidation dip
- every strength template referencing `Wall ball` carries the overhead-clearance note
- easy-run duration is non-decreasing across weeks 1→3 and drops in week 4 (deload)
- weeks 1–6 easy run / quality / long-run durations exactly match the brief's table (assert all 18 values explicitly)
- every `paceSource: 'goalRacePace'` prescription omits a hard-coded `targetPaceSecPerKm`
- no template has an empty `name` or a zero `estMinutes`
- `SEED_WEEKS_24` is deeply frozen-equivalent: two imports produce equal structures and mutating a returned copy does not affect the source

`src/data/seed/plan24Week/__tests__/priorities.test.ts` — assertions per D7:
- in every week, the four essential templates match §19's per-phase list for that week's phase
- every week has at least 4 `essential` templates, or where a week has only 4 templates total, all 4 are essential
- Zone 2 templates are always `optional`
- no week has more than one `optional` template beyond Zone 2 in weeks 1–12
- every week's essential count is ≥ `MIN_EFFECTIVE_WEEK_SESSIONS` minus the number of non-essential-but-required sessions — expressed concretely: `week.templates.filter(t => t.priority === 'essential').length >= 4` for all 24 weeks

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/data/seed/plan24Week`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the strength templates**

`strengthTemplates.ts` — two exported builders taking a week number and returning `SeedPrescription[]`:

**Strength A** (slot 1, `lowerBodyStrength` + `highImpactStation`): back squat 4×4–6 @ 175 lb week 1, RDL 3×6–8 @ 135 lb, split squat 3×8/leg @ 25 lb per dumbbell, sled push 6–8×12.5 m, sled pull 4–6×12.5 m, Pallof press or side plank 3 sets. Rest values come from the exercise defaults, restated explicitly on each prescription.

**Strength B** (slot 5, `upperBodyStrength` + `hybrid`): bench press 3×5–8 @ 140 lb week 1, pull-up or lat pulldown 3×6–10, walking lunge 3×15–20 m bodyweight, farmer carry 4×50 m building to 2×24 kg, burpee broad jump 4×10–15 m, SkiErg or row 4×500 m controlled.

Weeks 13+ reduce strength volume to maintenance (drop one set from the main lifts) while preserving intensity; weeks 22–24 reduce further. Encode as a `strengthVolumeFor(weekNumber)` helper returning set counts, not as duplicated literals.

- [ ] **Step 4: Implement the running progression**

`runProgression.ts` — an exported `RUN_PROGRESSION: Record<number, { easy: SeedTemplate; quality: SeedTemplate; slotSix: SeedTemplate; zone2Minutes: number }>` covering all 24 weeks with the exact content from the spec §8 and the brief §19:

- Weeks 1–6: easy 30/35/35/30/40/40 min; quality 6×2min, 7×2min, 5×3min, 6×1min, 4×5min tempo, 5×4min tempo; long 40/45/50/40/55/60 min. Week 4 is the deload.
- Weeks 7–12: W7 easy 40, quality 5×800 m, hybrid 4 rounds of 1 km + 1 station; W8 deload easy 35, 20-min tempo, long 50; W9 easy 45, 5×1 km, hybrid 5 rounds; W10 easy 45, 3×8min threshold, long 60–65; W11 easy 45, 6×1 km, hybrid 5 rounds with more station volume; W12 benchmark — easy recovery run, standalone 5 km test, half simulation of 4×1 km with ~50% station volume.
- Weeks 13–22: exactly the spec §8 table (quality session, slot-6 session, `stationVolumePct` 50/60/70/40/75/75/80/80/100/60, week 16 consolidation with 5 sessions, week 18 the 75% full-format simulation, week 21 the controlled full-format rehearsal, weeks 19/20/22 simulation-free).
- Weeks 23–24: taper per the spec — W23 ≈60–70% of peak (easy 35, Zone 2 35, 4×1 km race pace, light station technique, short strength), W24 ≈35–45% (easy 25, 3×600 m race-pace reminders, light technique, race day, race-day checklist note).

Zone 2 ramps 40 → 50 min across the plan, alternating SkiErg and row by week parity.

Every race-pace prescription sets `paceSource: 'goalRacePace'` and omits `targetPaceSecPerKm` so it resolves from the active goal (D15).

Lower-leg durability is appended to every easy-run template: straight-knee calf raise 3×12–15, bent-knee calf raise 3×12–15, tibialis raise 3×15–20.

- [ ] **Step 5: Assemble the weeks**

`weeks.ts` composes `SEED_WEEKS_24` from `SEED_PHASES`, the strength builders, and `RUN_PROGRESSION`. Priorities follow D7: the four essential slots per phase from §19, Zone 2 always `optional`, the remaining session `important`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:run -- src/data/seed/plan24Week`
Expected: PASS.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: seed the editable 24-week HYROX plan as structured data"
```

---

### Task 16: Repositories

**Files:**
- Create: `src/data/repositories/settingsRepo.ts`, `profileRepo.ts`, `goalRepo.ts`, `exerciseRepo.ts`, `standardsRepo.ts`, `planRepo.ts`, `workoutRepo.ts`, `logRepo.ts`, `scheduleRepo.ts`, `timerRepo.ts`, `index.ts`
- Test: `src/data/repositories/__tests__/workoutRepo.test.ts`, `exerciseRepo.test.ts`, `scheduleRepo.test.ts`, `timerRepo.test.ts`, `planRepo.test.ts`

**Interfaces:**
- Produces (abbreviated to the signatures later tasks call):
  ```ts
  // settings / profile / goal
  getSettings(): Promise<AppSettings>            // creates the default row if absent
  updateSettings(patch: Partial<AppSettings>): Promise<void>
  getProfile(): Promise<AthleteProfile>          // seeded with the brief's values on first read
  updateProfile(patch: Partial<AthleteProfile>): Promise<void>
  getActiveGoal(): Promise<RaceGoal | undefined>
  setRaceGoal(input: { raceDate: ISODate; targetSeconds: number; stretchSeconds: number }, now: ISOInstant): Promise<RaceGoal>

  // exercises
  listExercises(opts?: { includeArchived?: boolean; category?: ExerciseCategory; search?: string }): Promise<Exercise[]>
  createExercise(input: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'isSeeded'>, now: ISOInstant): Promise<Exercise>
  updateExercise(id: string, patch: Partial<Exercise>, now: ISOInstant): Promise<void>
  duplicateExercise(id: string, now: ISOInstant): Promise<Exercise>
  archiveExercise(id: string, now: ISOInstant): Promise<void>
  restoreExercise(id: string, now: ISOInstant): Promise<void>
  exerciseHistory(exerciseId: string): Promise<SessionPerformance[]>   // shape from Task 6

  // plan
  installSeedPlan(args: { today: ISODate; raceDate: ISODate; now: ISOInstant }): Promise<Plan>
  listPlans(): Promise<Plan[]>
  duplicatePlan(planId: string, name: string, now: ISOInstant): Promise<Plan>
  archivePlan(planId: string): Promise<void>
  setActivePlan(planId: string): Promise<void>
  restoreSeedPlanPreservingHistory(args: { today: ISODate; now: ISOInstant }): Promise<Plan>
  applyPrescriptionEdit(args: { instanceId: string; prescriptionId: string; patch: Partial<Prescription>; scope: EditScope; now: ISOInstant }): Promise<void>

  // workouts
  getTodaysWorkout(today: ISODate): Promise<WorkoutInstance | undefined>
  getInstanceWithPrescriptions(id: string): Promise<{ instance: WorkoutInstance; prescriptions: InstancePrescription[] } | undefined>
  startWorkout(id: string, now: ISOInstant): Promise<void>
  completeWorkout(args: { id: string; state: 'completed' | 'partiallyCompleted'; forDate: ISODate; now: ISOInstant }): Promise<void>
  addSet(args: { instanceId: string; instancePrescriptionId: string; now: ISOInstant }): Promise<StrengthSet>
  removeSet(setId: string): Promise<void>
  upsertSet(set: StrengthSet): Promise<void>          // guarded
  completeSet(setId: string, now: ISOInstant): Promise<void>   // idempotent

  // logs
  saveRunLog(log: RunLog, splits: IntervalSplit[]): Promise<void>
  saveStationLog(log: StationLog): Promise<void>
  saveSymptomLog(log: SymptomLog): Promise<void>
  listSymptomLogs(): Promise<SymptomLog[]>

  // schedule
  appendEvent(event: Omit<ScheduleEvent, 'id'>): Promise<void>
  listEvents(): Promise<ScheduleEvent[]>
  setOverride(args: { instanceId: string; date: ISODate; now: ISOInstant }): Promise<void>
  clearOverride(instanceId: string): Promise<void>
  resetRecommendations(now: ISOInstant): Promise<void>
  syncQueue(today: ISODate): Promise<QueueResult>      // recompute + persist derived cache

  // timer
  getTimerState(): Promise<RestTimerState | undefined>
  startTimer(args: { exerciseId?: string; label: string; totalSec: number; now: ISOInstant }): Promise<void>
  pauseTimer(now: ISOInstant): Promise<void>
  resumeTimer(now: ISOInstant): Promise<void>
  adjustTimer(deltaSec: number, now: ISOInstant): Promise<void>
  clearTimer(): Promise<void>
  ```

Every repository function takes `now`/`today` as a parameter — repositories are the boundary where the clock is injected, and only `src/hooks/useToday.ts` and `src/features/**` read the real clock.

- [ ] **Step 1: Write the failing workout repository test**

`src/data/repositories/__tests__/workoutRepo.test.ts` — assertions:
- `startWorkout` sets `status: 'inProgress'` and `startedAt`
- `addSet` appends with the next `setIndex` and prefills nothing (values are `undefined` until logged)
- `completeSet` sets `isCompleted` and `completedAt`
- **`completeSet` called twice yields one completion and does not throw** (double-submit guard)
- `upsertSet` on an instance whose `frozen` is true throws `HistoryImmutableError`
- `upsertSet` on a frozen instance with `allowHistoryEdit` succeeds
- `completeWorkout` with `partiallyCompleted` sets that status, freezes the instance, and appends a `PARTIAL` event
- `completeWorkout` with `completed` appends a `COMPLETE` event carrying `forDate`
- a partially completed instance is **never** readable as `completed`
- `getInstanceWithPrescriptions` returns prescriptions ordered by `order`
- sets written before a refresh are still present after reopening the database (persistence proof)

`src/data/repositories/__tests__/exerciseRepo.test.ts` — assertions:
- `createExercise` assigns an id, timestamps, and `isSeeded: false`
- `duplicateExercise` copies fields, appends ` (copy)` to the name, and produces a new id
- `archiveExercise` / `restoreExercise` flip `isArchived` without deleting
- `listExercises` excludes archived by default, includes them on request
- `listExercises` filters by category and by case-insensitive search
- `updateExercise` changing `defaultRestSec` **does not** alter any existing `InstancePrescription.restSec`
- `updateExercise` changing `progressionIncrement` **does not** alter any completed `StrengthSet`
- a custom exercise retains its rest default when added to a new workout

`src/data/repositories/__tests__/planRepo.test.ts` — assertions for the three edit scopes (§13, §14):
- `applyPrescriptionEdit` with `thisWorkout` changes only that `InstancePrescription`
- with `thisAndFuture` changes the template `Prescription` **and** every non-frozen future `InstancePrescription`, and leaves frozen ones untouched
- with `exerciseDefaultOnly` changes the `Exercise` and **neither** the template nor any scheduled instance
- in all three scopes, completed `StrengthSet` rows and frozen instances are byte-identical before and after
- `restoreSeedPlanPreservingHistory` recreates templates and future instances while every completed instance and every log row survives with identical values
- `duplicatePlan` produces an independent plan whose edits do not affect the original

`src/data/repositories/__tests__/scheduleRepo.test.ts` — assertions:
- `appendEvent` only ever appends; `listEvents` returns them in `at` order
- no repository function updates or deletes a `scheduleEvents` row (assert by writing several events, calling `resetRecommendations`, and confirming the count only grew)
- `syncQueue` persists derived `scheduledDate`/`status` onto `workoutInstances` and writes `queueExplanations`
- `syncQueue` run twice with the same `today` is idempotent
- `setOverride` then `syncQueue` honours the pinned date
- `resetRecommendations` appends a `RESET_RECOMMENDATIONS` event and, after `syncQueue`, clears manual overrides while preserving all completions

`src/data/repositories/__tests__/timerRepo.test.ts` — assertions:
- `startTimer` stores `endsAt = now + totalSec` and `isPaused: false`
- remaining time computed from a stored `endsAt` is correct after a simulated 30-second gap (pass a later `now`; no fake timers needed)
- `pauseTimer` stores `pausedRemainingSec` and clears `endsAt`
- `resumeTimer` recomputes `endsAt` from the paused remainder and the new `now`
- `adjustTimer(+30)` and `adjustTimer(-30)` shift `endsAt`, and `-30` never produces a negative remainder
- **the timer state survives closing and reopening the database** (the persistence requirement of §12)
- `clearTimer` removes the row

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/data/repositories`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the repositories**

One file per aggregate, each under 250 lines. Rules that the tests pin down:
- Every write to a log table first loads the owning instance and calls `assertMutable`.
- `completeSet` uses a conditional update (`if (existing.isCompleted) return`) so repeated calls are inert.
- `completeWorkout` sets `frozen: true` in the same transaction that appends the event.
- `applyPrescriptionEdit` branches on `EditScope` and never touches instances where `frozen === true`.
- `syncQueue` maps `WorkoutInstance` ↔ `QueueTemplate` (Task 10's `templateId` key), calls `recomputeQueue`, then writes only `scheduledDate`, `status`, `adjustmentReason`, and `isManualOverride` back onto non-frozen instances, replacing `queueExplanations` for the affected weeks.
- `getProfile` **seeds no personal values.** It creates the profile row with all athlete fields empty/unset on first read; the athlete supplies them during onboarding, and they live only in IndexedDB on the device. Committing anyone's age, height, weight, body fat, or symptom history into the repository is forbidden — this is a public repository and that is personal health data.
- `setRaceGoal` deactivates the previous goal rather than deleting it, and appends a `RACE_DATE_CHANGE` event so the queue recomputes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/data/repositories`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add guarded repositories for settings, exercises, plans, workouts, logs, schedule, and timer"
```

---

### Task 17: Versioned backup export, validation, and import (§20)

**Files:**
- Create: `src/domain/backup/constants.ts`, `src/domain/backup/validate.ts`, `src/data/backup/exportBackup.ts`, `src/data/backup/importBackup.ts`
- Test: `src/domain/backup/__tests__/validate.test.ts`, `src/data/backup/__tests__/roundTrip.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const BACKUP_FORMAT = 'hyrox-training-backup'
  interface BackupFile {
    format: typeof BACKUP_FORMAT
    schemaVersion: number
    appVersion: string
    exportedAt: ISOInstant
    counts: Record<string, number>
    data: Record<string, unknown[]>
  }
  type ValidationFailure =
    | { kind: 'notJson'; message: string }
    | { kind: 'wrongFormat'; message: string }
    | { kind: 'futureSchema'; message: string; found: number; supported: number }
    | { kind: 'missingTable'; message: string; table: string }
    | { kind: 'countMismatch'; message: string; table: string }
    | { kind: 'brokenReference'; message: string; table: string; field: string }
  type ValidationResult = { ok: true; file: BackupFile } | { ok: false; failure: ValidationFailure }
  validateBackup(raw: string): ValidationResult

  exportBackup(now: ISOInstant, appVersion: string): Promise<{ json: string; counts: Record<string, number> }>
  importBackup(raw: string, now: ISOInstant): Promise<{ ok: true; counts: Record<string, number> } | { ok: false; failure: ValidationFailure }>
  ```

- [ ] **Step 1: Write the failing validation test**

`src/domain/backup/__tests__/validate.test.ts` — assertions:
- a well-formed file validates and returns the parsed object
- non-JSON input → `notJson`, with no exception thrown
- valid JSON that is not a backup (e.g. `[]`, `{"hello":1}`, `null`) → `wrongFormat`
- a wrong `format` string → `wrongFormat`
- `schemaVersion` greater than `SCHEMA_VERSION` → `futureSchema` carrying both `found` and `supported`
- `schemaVersion` less than current → **valid** (older backups are importable and migrate forward)
- a missing required table key → `missingTable` naming the table
- a `counts` entry disagreeing with the actual array length → `countMismatch` naming the table
- a `strengthSets` row whose `instanceId` is absent from `workoutInstances` → `brokenReference` naming table and field
- every failure has a human-readable `message` that is non-empty and mentions the specific problem
- validation is pure: it never touches the database

- [ ] **Step 2: Write the failing round-trip test**

`src/data/backup/__tests__/roundTrip.test.ts` — assertions:
- export produces JSON that parses and whose `counts` match the actual row counts per table
- exported JSON is human-readable: it contains newlines and two-space indentation
- **full round trip**: seed a database with a plan, several completed workouts, strength sets, a run log with splits, a station log, symptom logs, schedule events, and an override; export; reset; import; then every table's rows are deeply equal to the originals
- import of an invalid file returns `{ ok: false }` and **leaves existing data byte-identical** (assert by snapshotting every table before and after)
- import of a `futureSchema` file is rejected without altering data
- import writes a `safetyBackups` row with `id: 'pre-import'` before replacing data
- importing twice in a row is idempotent — the second import yields the same row counts
- after a successful import, `settings.lastBackupAt` is unchanged (it records *exports*, not imports) but `settings.schemaVersion` equals `SCHEMA_VERSION`
- export followed by import preserves `frozen: true` on completed instances, so history stays immutable across a restore

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm run test:run -- backup`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`validate.ts` is pure and lives in `src/domain/backup` — it takes a string and returns a result, never touching Dexie. Referential checks cover `strengthSets.instanceId`, `instancePrescriptions.instanceId`, `intervalSplits.runLogId`, `runLogs.instanceId`, `stationLogs.instanceId`, `prescriptions.templateId`, and `workoutTemplates.planId`.

`exportBackup` reads every table via `db.tables`, builds `counts`, and serializes with `JSON.stringify(file, null, 2)`.

`importBackup` order is mandatory and asserted by the tests: validate → write `safetyBackups` row → single Dexie transaction that clears every table and `bulkPut`s the imported rows → set `settings.schemaVersion` → return counts. Validation failure returns before the safety backup is written, so a rejected import performs **zero** writes.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- backup`
Expected: PASS.

- [ ] **Step 6: Run the full suite and gates**

Run: `npm run test:run`; `npm run lint`; `npm run typecheck`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add versioned backup export, strict validation, and safe import"
```

---

# Phase 3 — Application

Every task in this phase writes component tests with React Testing Library against a real (fake-indexeddb) database seeded by a shared helper. Create that helper first.

### Task 18: App shell, routing, bottom navigation, and boot sequence

**Files:**
- Create: `src/test/renderApp.tsx`, `src/test/seedTestDb.ts`, `src/hooks/useToday.ts`, `src/hooks/useSettings.ts`, `src/hooks/useQueue.ts`, `src/features/shell/AppShell.tsx`, `src/features/shell/BottomNav.tsx`, `src/features/shell/BootGate.tsx`, `src/features/shell/DbErrorScreen.tsx`, `src/router.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/features/shell/__tests__/shell.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  useToday(): ISODate                    // reads the real clock; re-evaluates on visibilitychange and at local midnight
  useSettings(): AppSettings | undefined
  useQueue(today: ISODate): { instances: WorkoutInstance[]; explanations: QueueExplanation[] } | undefined
  renderApp(opts?: { route?: string }): RenderResult          // test helper
  seedTestDb(opts?: { raceDate?: ISODate; today?: ISODate; withHistory?: boolean }): Promise<void>
  ```
  Routes: `/` Home · `/workout/:id` Workout · `/progress` Progress · `/plan` Plan · `/plan/week/:week` Week · `/plan/workout/:id` Workout editor · `/library` Exercise library · `/library/:id` Exercise detail · `/settings` Settings · `/onboarding` Onboarding.

- [ ] **Step 1: Write the failing shell test**

`src/features/shell/__tests__/shell.test.tsx` — assertions:
- the four bottom-nav destinations render as links with accessible names `Home`, `Progress`, `Plan`, `Settings`
- exactly four nav items — no hamburger menu anywhere in the tree (`queryByRole('button', { name: /menu/i })` is null)
- the current route's nav item has `aria-current="page"`
- clicking a nav item navigates and updates `aria-current`
- every nav item's rendered element has a computed `min-height` of at least 44px (assert the class is applied and the token is defined; a jsdom computed-style check on `min-height` reading `44px`)
- when `onboardingCompletedAt` is unset, the shell redirects to `/onboarding` from any route
- when it is set, `/` renders Home and does not redirect
- when `openDb()` rejects with a `quotaExceeded` `DbUnavailableError`, `DbErrorScreen` renders with the specific reason, a Retry button, and an "Export what we can" button — never a blank screen
- an error thrown inside a route is caught by the route's `ErrorBoundary` and the nav remains usable
- the shell root applies `padding-bottom` accounting for `--safe-bottom` and `--nav-height`

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/features/shell`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the test helpers**

`seedTestDb.ts` — opens the database, runs `seedIfEmpty`, calls `installSeedPlan` with a fixed `today`/`raceDate`, and when `withHistory` is set, writes two completed strength workouts (back squat 175 lb × 5 with RIR 2, bench 140 lb × 8), one run log with splits, one station log, and three symptom logs. Every test that needs data calls this, so no test constructs raw rows.

`renderApp.tsx` — renders `<App />` inside a `MemoryRouter` at the requested route, wrapped in the same providers `main.tsx` uses.

- [ ] **Step 4: Implement the shell**

- `useToday` returns `YYYY-MM-DD` in the device's local timezone, recomputed on `visibilitychange` and via a timeout scheduled for the next local midnight. This is the **only** place in the app that derives today's date; every domain call receives it.
- `BootGate` calls `openDb()`, then `seedIfEmpty`, then renders children. While pending it shows a minimal spinner-free "Loading…" text (no animation). On `DbUnavailableError` it renders `DbErrorScreen` with copy specific to the `kind`.
- `AppShell` is a flex column: `<main>` scrolls, `<BottomNav>` is fixed with `padding-bottom: var(--safe-bottom)`, and slots exist above the nav for the rest-timer bar (Task 20) and the active-workout bar.
- `BottomNav` uses `<NavLink>` with `aria-current` handled by react-router, `min-height: var(--tap-min)`, icon + text label (text always present — never icon-only).
- Each route element is wrapped in `<ErrorBoundary>`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:run -- src/features/shell`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add app shell, routing, bottom navigation, and resilient boot sequence"
```

---

### Task 19: Onboarding (race date, profile, goal)

**Files:**
- Create: `src/features/onboarding/OnboardingScreen.tsx`, `RaceDateStep.tsx`, `ProfileStep.tsx`, `GoalStep.tsx`, `useOnboarding.ts`
- Test: `src/features/onboarding/__tests__/onboarding.test.tsx`

- [ ] **Step 1: Write the failing onboarding test**

Assertions:
- three steps render in order: race date → profile → goal, with a back control on steps 2 and 3
- the profile step renders **empty** fields for age, height, weight, and body fat, each with a clear label, unit, and placeholder, plus a free-text field for recurring considerations (e.g. a symptom history the athlete wants to note). No personal values are prefilled — they are the athlete's to enter and are never committed to the repository. Body fat and considerations are optional; age, height, and weight are required because load styles and guidance depend on them
- the goal step defaults to target `1:35:00` and stretch `1:30:00` (D16), both editable, parsed via `parseRaceTime`
- selecting a race date fewer than 24 weeks out shows a **warning** naming the shortfall, and still allows continuing (§2)
- selecting a race date more than 24 weeks out shows the Base-weeks explanation from `anchorPlan`
- selecting a race date beyond 32 weeks shows the deferred-start explanation with the computed start date
- the goal step shows the derived milestones for the chosen target (`compromisedKmTargetSec` and `standalone5kTargetSec` formatted), and they update live when the target time changes
- finishing writes the profile, the goal, and `onboardingCompletedAt`, installs the seed plan, and navigates to `/`
- after finishing, `workoutInstances` contains one row per seeded template and week 24 contains the race week
- every input has an associated label and a `font-size` of at least 16px
- the date input is `type="date"` so iOS shows the native picker
- attempting to continue with an empty race date is blocked with an inline validation message, not a silent no-op

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/features/onboarding`
Expected: FAIL.

- [ ] **Step 3: Implement**

`useOnboarding` holds step state and calls `anchorPlan` on every race-date change to produce the live explanation. Finishing calls `updateProfile`, `setRaceGoal`, `installSeedPlan`, `updateSettings({ onboardingCompletedAt })`, and `syncQueue` in that order, then navigates.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/features/onboarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add onboarding with race-date anchoring and live milestone preview"
```

---

### Task 20: Persistent rest timer (§12)

**Files:**
- Create: `src/features/timer/RestTimerBar.tsx`, `src/features/timer/useRestTimer.ts`, `src/features/timer/feedback.ts`
- Test: `src/features/timer/__tests__/restTimer.test.tsx`, `src/features/timer/__tests__/useRestTimer.test.ts`

**Interfaces:**
- Produces:
  ```ts
  useRestTimer(): {
    state: RestTimerState | undefined
    remainingSec: number
    isRunning: boolean
    start: (a: { exerciseId?: string; label: string; totalSec: number }) => Promise<void>
    pause: () => Promise<void>
    resume: () => Promise<void>
    add: (deltaSec: number) => Promise<void>
    skip: () => Promise<void>
  }
  remainingFrom(state: RestTimerState, now: ISOInstant): number     // pure, exported for testing
  playFeedback(settings: Pick<AppSettings, 'restSoundEnabled' | 'restVibrationEnabled'>): void
  vibrationSupported(): boolean
  ```

- [ ] **Step 1: Write the failing pure-logic test**

`useRestTimer.test.ts` asserts `remainingFrom`:
- a running timer with `endsAt` 90 s ahead returns 90
- the same state evaluated 30 s later returns 60 — proving accuracy is derived from the stored timestamp, not from tick accumulation
- a state whose `endsAt` has passed returns 0, never a negative number
- a paused state returns `pausedRemainingSec` regardless of elapsed wall time — this is the screen-lock case
- a paused state with no remainder returns 0
- `remainingFrom` is pure and does not read the clock itself

- [ ] **Step 2: Write the failing component test**

`restTimer.test.tsx` assertions:
- the bar is absent when no timer row exists
- starting a timer renders the label and `MM:SS`, with `aria-live="polite"` on the countdown
- Pause, Resume, +30s, −30s, and Skip controls all exist as buttons with accessible names, each ≥44×44px
- `+30s` increases the displayed remainder; `−30s` decreases it and clamps at `0:00`
- Skip removes the bar and clears the persisted row
- **remounting the component with the same database restores an accurate countdown** (the refresh-survival requirement): write a timer state with `endsAt` in the future, unmount, remount, and assert the rendered remainder matches
- pausing, unmounting, remounting shows the paused remainder unchanged
- the bar renders above the bottom nav and respects `--safe-bottom`
- sound and vibration are **off** by default: with default settings, starting and expiring a timer calls neither `navigator.vibrate` nor any audio constructor (spy on both)
- with `restVibrationEnabled: true` and `navigator.vibrate` present, expiry calls it once
- with `restVibrationEnabled: true` and `navigator.vibrate` absent (iOS), nothing throws
- the countdown reaching zero does not navigate, does not open a dialog, and does not depend on Notification API

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:run -- src/features/timer`
Expected: FAIL.

- [ ] **Step 4: Implement**

`useRestTimer` reads the row with `useLiveQuery` and drives a 250 ms `setInterval` purely to re-render; the displayed value always comes from `remainingFrom(state, new Date().toISOString())`. All mutations go through `timerRepo`. `feedback.ts` feature-detects `navigator.vibrate` and constructs an `AudioContext` lazily only when sound is enabled.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/features/timer`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add timestamp-backed rest timer that survives navigation and refresh"
```

---

### Task 21: Workout logging — strength (§8)

The centrepiece. Minimum-clicks is the acceptance criterion.

**Files:**
- Create: `src/features/workout/WorkoutScreen.tsx`, `ExerciseCard.tsx`, `SetRow.tsx`, `TargetHeader.tsx`, `useWorkout.ts`, `useAutosave.ts`, `constants.ts`
- Test: `src/features/workout/__tests__/strengthLogging.test.tsx`, `src/features/workout/__tests__/autosave.test.tsx`

- [ ] **Step 1: Write the failing strength logging test**

Assertions — these encode §8 literally:
- the whole workout renders on one scrollable screen with **every exercise expanded**: for a 6-exercise workout, all 6 exercise names and all their set rows are in the document on first render, with no expander button required
- there is no `button` whose accessible name matches `/expand|show more|details/i`
- for each strength exercise the following are visible **without any interaction**: exercise name, prescribed sets and rep range (`4 × 4–6`), most recent logged performance with its date (`Last: 175 lb × 5 · Jul 20`), last week's weight when present, today's target (`Today's target: 180 lb × 5`), and the one-sentence reason
- when no session exists in the previous calendar week, last-week is absent but the most recent performance and its date are still shown
- every planned set renders as a separate editable row with weight, reps, and optional RIR inputs
- set rows are **prefilled** with the recommended target values
- one tap on a set's complete control marks it complete — assert exactly one `click` produces `isCompleted: true` in the database
- completing a set **starts the rest timer** with that exercise's `defaultRestSec`
- the complete control is disabled while its write is in flight and a second immediate click writes nothing extra (double-submit guard) — assert the database has one completion and no duplicate rows
- editing weight or reps happens inline: typing in a field never opens a dialog (`queryByRole('dialog')` stays null)
- Add set appends a row prefilled from the previous row's values
- Remove set removes the last row and its database row
- exercise notes render when present and are absent when empty
- a `Use target` control sets the row's weight to the recommendation in one tap
- an `optionalIncrease` recommendation prefills the row at the **previous** weight while displaying the higher target as an aim (D-rule from Task 7)
- the reason sentence for a symptom hold names the symptom
- a station exercise renders station fields (distance, load, time, RPE) rather than weight/reps
- the screen has no horizontal scrollbar at a 375px viewport (assert `document.body.scrollWidth <= 375`)

- [ ] **Step 2: Write the failing autosave test**

Assertions:
- typing a weight persists it to IndexedDB within `AUTOSAVE_DEBOUNCE_MS` (advance timers and flush)
- blurring a field flushes immediately without waiting for the debounce
- unmounting the screen flushes pending edits
- **partially entered data survives a remount**: type a weight into set 2, remount the screen, and the value is still there
- `document` `visibilitychange` to hidden flushes pending edits
- starting a workout sets `status: 'inProgress'` so Home can offer Continue
- no React state holds a value that is absent from the database after a flush (assert by remounting and comparing every input's value)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:run -- src/features/workout`
Expected: FAIL.

- [ ] **Step 4: Implement**

`useWorkout(instanceId)` loads the instance and prescriptions, and for each strength prescription calls `recommendStrengthTarget` with history from `exerciseHistory`, the evaluated `SymptomState`, and `today`. `TargetHeader` renders the previous/last-week/target/reason block. `SetRow` is a controlled row whose commits go through `useAutosave`. Completion writes through `completeSet` (idempotent by design) and calls `startTimer`.

`useAutosave` holds a `Map<string, pending>` and flushes on debounce, blur, `visibilitychange`, and unmount.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/features/workout`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add single-screen strength logging with inline targets and autosave"
```

---

### Task 22: Workout logging — runs, intervals, and HYROX stations (§10, §11)

**Files:**
- Create: `src/features/workout/RunBlock.tsx`, `IntervalSplitsEditor.tsx`, `StationBlock.tsx`, `SledFields.tsx`
- Test: `src/features/workout/__tests__/runLogging.test.tsx`, `src/features/workout/__tests__/stationLogging.test.tsx`

- [ ] **Step 1: Write the failing run logging test**

Assertions:
- distance (km), duration, surface, run type, session RPE, shin, sciatic, and notes inputs all render with labels
- pace is **computed and displayed** from distance and duration as they are typed, formatted `6:20/km`
- pace shows `—` for zero distance, zero duration, and cleared fields — never `NaN` or `Infinity`
- surface offers exactly track, treadmill, road, other
- run type offers exactly easy, long, tempo, intervals, compromised, benchmark, race
- saving writes a `RunLog` with the computed `paceSecPerKm`
- **split logging is optional**: the run saves with distance and duration alone, and the splits editor is collapsed by default behind a single control
- opening the splits editor allows warm-up, rep count, work duration or distance, recovery duration, individual split times, and cooldown
- entering 5 reps generates 5 work rows plus recovery rows
- the editor shows the work-only mean pace from `summarizeSplits`
- saving persists `IntervalSplit` rows with correct `index` and `kind`
- an interval workout template prefills the editor from `prescription.intervalSpec`
- a race-pace prescription displays the goal-derived target pace, and changing the goal in settings changes the displayed target

- [ ] **Step 2: Write the failing station logging test**

Assertions:
- all eight stations are selectable with correct labels
- fields render per station: distance, reps, load, completion time, set/break structure, RPE, notes, and station technique notes
- the seeded Men's Open standard is shown as the reference for the selected station
- kilogram loads display an approximate pound equivalent (`152 kg · ~335 lb`)
- sled stations additionally render total loaded weight, sled weight, and surface
- sled blocks display the note that friction makes cross-venue comparison imperfect
- wall balls display the overhead-clearance safety note and default to 100 reps, 6 kg, 3.0 m from the editable standards
- editing a HYROX standard in settings changes the reference shown here (proving standards are configuration, not hard-coded)
- saving persists a `StationLog` with the entered values and the chosen unit
- a station with no load entered still saves distance and time

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:run -- src/features/workout`
Expected: FAIL on the two new files, existing strength tests still pass.

- [ ] **Step 4: Implement**

Reuse `NumberField`, `SegmentedControl`, `ScaleSelector`. Pace comes from `paceSecPerKm`; split summaries from `summarizeSplits`; equivalents from `formatWithEquivalent`. Station references read `hyroxStandards` from the database, never a literal.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/features/workout`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add run, interval split, and HYROX station logging"
```

---

### Task 23: Workout completion, symptom capture, and substitutions (§8, §16)

**Files:**
- Create: `src/features/workout/WorkoutFooter.tsx`, `SymptomCapture.tsx`, `CompletionActions.tsx`, `CompletedEarlierSheet.tsx`, `src/features/symptoms/SubstitutionCard.tsx`, `src/features/symptoms/RedFlagScreen.tsx`
- Test: `src/features/workout/__tests__/completion.test.tsx`, `src/features/symptoms/__tests__/substitutions.test.tsx`

- [ ] **Step 1: Write the failing completion test**

Assertions:
- the footer shows three horizontally arranged 0–10 one-tap scales: session RPE, shin pain, sciatic/back symptoms, each with a sensible default
- all five completion states are offered: Completed, Partially completed, Completed earlier, Deferred, Skipped
- choosing Completed writes a symptom log, freezes the instance, appends a `COMPLETE` event, and navigates Home
- choosing Partially completed sets `partiallyCompleted` and the instance is **never** reported as `completed` anywhere
- Completed earlier opens a date picker limited to past dates, and choosing one writes `completedForDate` and a `COMPLETE_EARLIER` event
- after a backdated completion, `syncQueue` runs and the resulting explanation mentions the backdated session
- Deferred appends a `DEFER` event and does not write a symptom log
- Skipped appends a `SKIP` event and does not write a symptom log
- completing twice by double-tapping produces exactly one event
- a red-flag screen appears **only** when the entered sciatic value is ≥5, offering exactly the three questions
- answering yes to any red-flag question shows the urgent card, and it persists on Home until dismissed
- answering no to all shows no urgent card
- the red-flag screen never appears for shin values alone

- [ ] **Step 2: Write the failing substitution test**

Assertions:
- with elevated shin symptoms, the affected upcoming workout shows a `SubstitutionCard`
- every card carries the exact text `Training-load suggestion, not a medical diagnosis.`
- the card offers Accept, Modify, and Dismiss, each reachable in one tap
- Accept mutates only that instance's prescriptions — the template `Prescription` rows are unchanged
- Accept on an impact-reduction suggestion reduces the instance's run distance by 20–30%
- Dismiss records the dismissal in `settings.dismissedSubstitutions` and the card does not reappear for that instance
- Dismiss does not suppress the card on a *different* affected instance
- **no workout is ever auto-cancelled**: with elevated symptoms, every scheduled instance retains a non-null `scheduledDate` and no status becomes `skipped` or `autoDropped` from symptoms alone
- the card text uses no diagnostic language (no "you have", no condition names)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:run -- src/features/workout src/features/symptoms`
Expected: FAIL.

- [ ] **Step 4: Implement**

`WorkoutFooter` composes `SymptomCapture` (three `ScaleSelector`s) and `CompletionActions`. Completion handlers are guarded by an in-flight ref so a double tap yields one event. `SubstitutionCard` renders `Substitution` objects from `suggestSubstitutions`. Accept applies a documented transform per `SubstitutionKind` to the instance's prescriptions only.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/features/workout src/features/symptoms`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add workout completion states, symptom capture, and substitution cards"
```

---

### Task 24: Home screen (§7)

**Files:**
- Create: `src/features/home/HomeScreen.tsx`, `TodaysWorkoutCard.tsx`, `ThisWeekCard.tsx`, `GoalSnapshotCard.tsx`, `useHomeData.ts`
- Test: `src/features/home/__tests__/home.test.tsx`

- [ ] **Step 1: Write the failing Home test**

Assertions — §7 in order:
- the three sections render in exactly this DOM order: Today's workout, This week, Goal snapshot (assert by comparing `compareDocumentPosition` or heading order)
- Today's workout shows name, training phase and week, priority, approximate duration, the exercise or run structure inline, the reason it is recommended today, any schedule-adjustment explanation, and any symptom caution
- Start is offered for an upcoming workout and navigates to `/workout/:id`
- Continue is offered instead when `status === 'inProgress'`
- Completed earlier, Defer, Skip, and Edit are offered where applicable and absent where not
- when the queue moved a workout, the plain-language explanation renders verbatim from `queueExplanations`
- This week shows essential completed count, total completed, four-session minimum status, partially completed sessions, skipped and dropped sessions, the current recommended schedule, original dates where they differ, the current phase, and exactly **one** next-best action
- This week contains **no** streak language and none of `/streak|don't break|failed|behind schedule|you missed/i`
- Goal snapshot shows target race date, target time, current plan week, running milestone status, strength-maintenance status, recent symptom status, a trajectory pill, and a brief explanation naming specific milestone evidence
- Goal snapshot shows **no predicted finishing time** when benchmark data is insufficient, and instead says so
- with a 5 km benchmark, a compromised mean, and a 75% simulation all present, a **range** labelled as an estimate appears
- an empty database (no plan) renders a useful empty state with a route to onboarding, not a crash
- when every session for today is complete, the card says so and offers the next session rather than showing an empty slot

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/features/home`
Expected: FAIL.

- [ ] **Step 3: Implement**

`useHomeData(today)` composes `syncQueue`, `evaluateSymptoms`, `evaluateMilestones`, `computeTrajectory`, and `estimateRaceRange`, returning a single view model so the three cards stay presentational.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/features/home`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Home with today's workout, weekly status, and goal snapshot"
```

---

### Task 25: Progress — strength history (§17)

**Files:**
- Create: `src/features/progress/ProgressScreen.tsx`, `StrengthProgress.tsx`, `WorkingWeightChart.tsx`, `OneRepMaxChart.tsx`, `RecentSessionsList.tsx`, `PersonalBestsCard.tsx`, `ChartTable.tsx`
- Test: `src/features/progress/__tests__/strengthProgress.test.tsx`

- [ ] **Step 1: Write the failing test**

Assertions:
- a segmented control switches between Strength and Running
- an exercise picker lists every non-archived exercise with history
- selecting an exercise shows working weight over time, recent sessions with sets/reps/RIR, personal bests, actual versus recommended target, previous weight, and the current recommended target
- the estimated 1RM chart appears only when `hasEnough1RMData` is true, and is labelled "estimated"
- with fewer than three qualifying sessions, an explanatory message replaces the 1RM chart
- every chart has an accessible tabular fallback (`ChartTable`) with the same data
- charts render inside a container with `overflow-x: auto` and the page body does not scroll horizontally at 375px
- an exercise with no history shows an `EmptyState`, not an empty chart
- Recharts renders without a `ResponsiveContainer` width warning (assert no console error)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/features/progress`
Expected: FAIL.

- [ ] **Step 3: Implement**

Charts use `oneRepMaxTrend`, `computePersonalBests`, and `recommendStrengthTarget`. Height fixed at 200–220px, at most 4 series, direct labels where space allows. Each chart is followed by a `<ChartTable>` in a `<details>` element so it is available but not noisy.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/features/progress`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add strength progress charts with accessible tabular fallbacks"
```

---

### Task 26: Progress — running (§17)

**Files:**
- Create: `src/features/progress/RunningProgress.tsx`, `WeeklyVolumeChart.tsx`, `PaceByTypeChart.tsx`, `MilestoneList.tsx`
- Test: `src/features/progress/__tests__/runningProgress.test.tsx`

- [ ] **Step 1: Write the failing test**

Assertions:
- weekly distance renders with **four visually and textually distinguished categories**: planned, completed, missed, dropped — each named in a legend, never distinguished by colour alone
- run distance over time, average pace by run type, easy-run pace trend, 5 km benchmark history, longest continuous run, and compromised-kilometre pace all render
- the current milestone versus the goal-derived target is shown, using `goalTargets` — assert the displayed 5 km target changes when the goal time changes
- goal trajectory toward the race date renders with its evidence
- completed-versus-planned distance is shown as both values, not a single percentage
- a week with no runs shows zero rather than being omitted from the chart
- charts are legible at 375px: fixed height, no horizontal body scroll, tabular fallback present
- an empty database shows an `EmptyState`

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/features/progress`
Expected: FAIL on the new file.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/features/progress`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add running progress with planned vs completed volume and goal-derived milestones"
```

---

### Task 27: Plan customization (§14)

**Files:**
- Create: `src/features/plan/PlanScreen.tsx`, `WeekList.tsx`, `WeekDetail.tsx`, `WorkoutEditor.tsx`, `PrescriptionEditor.tsx`, `EditScopeSheet.tsx`, `PlanManager.tsx`, `ConflictWarningSheet.tsx`
- Test: `src/features/plan/__tests__/planEditing.test.tsx`, `src/features/plan/__tests__/planManagement.test.tsx`, `src/features/plan/__tests__/manualMove.test.tsx`

- [ ] **Step 1: Write the failing plan-editing test**

Assertions:
- the week list shows all weeks with phase, completion, and current status
- an upcoming workout can be edited, added, deleted, duplicated, and reordered
- exercises can be added, removed, substituted, and reordered via move-up/move-down buttons (no drag, and both buttons are keyboard reachable)
- sets, reps, loads, distances, paces, rest times, priorities, and notes are all editable
- saving an edit opens `EditScopeSheet` offering exactly: This workout only / This and all future instances / Update the exercise default without changing scheduled workouts
- each scope produces the behaviour proved in Task 16's `planRepo` tests, verified here at the UI level
- **a completed workout is not editable through the normal path**; it shows a distinct "Edit this past record" affordance that warns before proceeding
- editing a template never changes a completed record: snapshot a completed instance's sets before and after a `thisAndFuture` edit and assert deep equality
- a workout in the past that is not completed can still be edited

- [ ] **Step 2: Write the failing plan-management test**

Assertions: duplicate plan, create plan from scratch, archive and restore, select a new active plan, change plan duration, change race date, change target time. Changing the race date or target time recalculates dates and milestones, preserves all completed history, warns when fewer than 24 weeks remain, and re-dates nothing that is already completed (assert every completed instance's `completedForDate` is identical before and after).

- [ ] **Step 3: Write the failing manual-move test**

Assertions: moving a workout to a day with a hard recovery conflict opens `ConflictWarningSheet` naming the specific conflict; Proceed performs the move and records it; Pick another day cancels; the moved date survives a later unrelated recomputation; "Reset schedule recommendations" clears automated moves while every completed instance and log row survives.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:run -- src/features/plan`
Expected: FAIL.

- [ ] **Step 5: Implement**

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:run -- src/features/plan`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add plan and workout customization with explicit edit scopes"
```

---

### Task 28: Exercise library (§13)

**Files:**
- Create: `src/features/library/LibraryScreen.tsx`, `ExerciseForm.tsx`, `ExerciseDetail.tsx`, `ExerciseHistoryList.tsx`, `AddToWorkoutSheet.tsx`
- Test: `src/features/library/__tests__/library.test.tsx`

- [ ] **Step 1: Write the failing test**

Assertions: create, edit, duplicate, archive, restore, search, filter by category, view history, add to the current workout, add to future templates, and reorder. The form exposes every definition field from §13 (name, category, measurement type, load style, default unit, default rest, progression increment, default sets, default rep range, default distance or duration, technique notes, active/archived). A newly created exercise reused later retains its rest default. Archiving does not delete history. Filtering and searching combine. Editing a seeded exercise is permitted and marks it as user-modified.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- src/features/library`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- src/features/library`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add exercise library with full CRUD, search, filter, and history"
```

---

### Task 29: Settings, backup UI, and standards editor (§20)

**Files:**
- Create: `src/features/settings/SettingsScreen.tsx`, `ProfileSettings.tsx`, `GoalSettings.tsx`, `UnitSettings.tsx`, `TimerSettings.tsx`, `StandardsEditor.tsx`, `BackupSettings.tsx`, `DangerZone.tsx`, `StorageStatus.tsx`
- Test: `src/features/settings/__tests__/settings.test.tsx`, `src/features/settings/__tests__/backupUi.test.tsx`

- [ ] **Step 1: Write the failing settings test**

Assertions: profile, race goal and date, units, rest-timer defaults, and sound/vibration toggles are all editable and persist. Sound and vibration are **off by default**. The vibration toggle is disabled with an explanatory note when `navigator.vibrate` is absent. The HYROX standards editor edits every station's distance, reps, load, ball weight, and target height, and the edits are what station logging then displays. Changing the target time updates the derived milestones shown on Progress. Changing the race date warns when fewer than 24 weeks remain.

- [ ] **Step 2: Write the failing backup UI test**

Assertions: Export produces a download whose contents pass `validateBackup` (spy on the object URL / anchor click rather than asserting a real download). The last successful backup date is displayed and updates after an export. Import accepts a file, validates it, and reports counts on success. Import of an invalid file shows the specific validation failure message and **leaves data unchanged**. A safety backup is created before a successful import. "Restore the original 24-week plan" re-seeds the plan and preserves every completed record. "Reset application data" requires typing a confirmation phrase before the button enables, and is the only destructive path. The screen displays the plain-language note that locally stored browser or PWA data can be lost if site data is deleted, so periodic export matters. `StorageStatus` reports whether `navigator.storage.persist()` was granted, handling the absent-API case.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:run -- src/features/settings`
Expected: FAIL.

- [ ] **Step 4: Implement**

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run -- src/features/settings`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add settings, editable HYROX standards, and backup and restore UI"
```

---

### Task 30: PWA — manifest, service worker, icons, and update prompt (§4)

**Files:**
- Create: `scripts/generate-icons.mjs`, `public/icon.svg`, `src/features/shell/UpdatePrompt.tsx`, `src/pwa.ts`
- Modify: `vite.config.ts`, `index.html`, `src/main.tsx`
- Test: `src/features/shell/__tests__/updatePrompt.test.tsx`, `src/__tests__/pwaConfig.test.ts`

- [ ] **Step 1: Write the failing configuration test**

`src/__tests__/pwaConfig.test.ts` — imports `vite.config.ts` and asserts the resolved PWA options:
- `registerType` is `'prompt'`, never `'autoUpdate'` (D9)
- `manifest.start_url` and `manifest.scope` both derive from the configured `base`
- `manifest.display` is `'standalone'`, `orientation` `'portrait'`, `theme_color` `#FFFFFF`, `background_color` `#FFFFFF`
- icons include 192, 512, and a 512 `maskable` entry
- `workbox.globPatterns` covers `js`, `css`, `html`, `svg`, `png`, `woff2`
- `navigateFallback` is set so refreshing a route works
- no runtime caching rule points at an external origin (offline-only requirement)
- with `VITE_BASE=/hyrox-training/`, `base`, `start_url`, `scope`, and icon `src` values all carry the subpath

- [ ] **Step 2: Write the failing update-prompt test**

Assertions: no card renders when no update is waiting; when a waiting worker is signalled, a card appears offering "Update now" and "Later"; the card states that workout data is preserved; "Update now" posts `SKIP_WAITING` and reloads; "Later" dismisses without reloading; **nothing in the update path clears IndexedDB** (assert row counts before and after).

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:run -- pwaConfig updatePrompt`
Expected: FAIL.

- [ ] **Step 4: Generate the icon**

`public/icon.svg` — original artwork, no HYROX branding: a rounded-square tile in `--accent` containing an abstract barbell (a horizontal bar with two plate blocks at each end) whose vertical negative space reads as an implied "H". `scripts/generate-icons.mjs` uses sharp to rasterize 180 (apple-touch), 192, 512, and a 512 maskable variant with 10% safe-zone padding.

Run: `npm run icons`
Expected: four PNGs written to `public/`.

- [ ] **Step 5: Implement the PWA config and update prompt**

Add `VitePWA` to `vite.config.ts` with the asserted options. `src/pwa.ts` wraps `registerSW` from `virtual:pwa-register` and exposes a subscribable "update available" signal. Add the apple-touch-icon link and `apple-mobile-web-app-*` meta tags to `index.html`.

- [ ] **Step 6: Run the tests and build**

Run: `npm run test:run -- pwaConfig updatePrompt`
Expected: PASS.

Run: `npm run build`
Expected: succeeds and emits `dist/sw.js`, `dist/manifest.webmanifest`, and the icons.

Run: `$env:VITE_BASE = '/hyrox-training/'; npm run build; Remove-Item Env:VITE_BASE`
Expected: succeeds; `dist/manifest.webmanifest` contains `/hyrox-training/` in `start_url`, `scope`, and icon paths.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add PWA manifest, service worker, original icon, and non-destructive update prompt"
```

---

### Task 31: README, GitHub Actions deployment, and SPA fallback (§24)

**Files:**
- Create: `README.md`, `.github/workflows/deploy.yml`, `public/404.html` generation step
- Modify: `vite.config.ts` (404 emit), `package.json`
- Test: `src/__tests__/deployConfig.test.ts`

- [ ] **Step 1: Write the failing deployment configuration test**

Assertions: the workflow file exists and parses as YAML; it triggers on push to `main` and on `workflow_dispatch`; it sets `permissions: pages: write, id-token: write`; it uses `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`; it sets `VITE_BASE` from the repository name; it runs lint, typecheck, tests, and build before deploying; it uses Node 24. Also assert that the build emits `404.html` with the same content as `index.html`, so refreshing a deep route on GitHub Pages works.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- deployConfig`
Expected: FAIL.

- [ ] **Step 3: Implement the workflow and 404 fallback**

The workflow computes `VITE_BASE=/${{ github.event.repository.name }}/`. A tiny Vite `closeBundle` plugin copies `dist/index.html` to `dist/404.html`.

- [ ] **Step 4: Write the README**

Cover every §24 item, with exact PowerShell commands:
- what the app does; architecture and major decisions (pure domain layer, derived queue, immutable history, local-only storage); project structure
- install: `powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1` then `npm install`, with the OneDrive junction explained
- start locally: `npm run dev`
- test from an iPhone on the same Wi-Fi: `npm run dev:lan`, find the LAN IP with `ipconfig`, open `http://<ip>:5173`, **and the caveat that service workers require `localhost` or HTTPS — so install and offline behaviour must be verified on the deployed GitHub Pages URL, not over LAN HTTP**
- run tests: `npm run test:run`, `npm run e2e`
- production build: `npm run build`, preview with `npm run preview`
- GitHub Pages: exact steps to create the repo, push, and set Pages source to GitHub Actions; note that `VITE_BASE` is derived automatically
- Add to Home Screen on iPhone via Safari, step by step
- how local data works (IndexedDB, nothing leaves the device, no accounts)
- how backups work (versioned JSON, safety backup before import, validation rejects bad files without touching data)
- how to update the deployed app without deleting workout history (push to main; the update prompt never clears IndexedDB; migrations run on next open)
- known iOS PWA limitations: no background timers so the rest timer cannot alert while backgrounded (it stays accurate), no push notifications by design, evictable storage, data lost if site data is cleared, no Apple Health
- troubleshooting: `node`/`npm` not found after install (restart the shell), OneDrive `EPERM`/`EBUSY` (re-run the setup script), Playwright browser missing (`npx playwright install chromium`), stale service worker (the update prompt, or Safari → Advanced → Website Data), blank page on GitHub Pages (wrong `VITE_BASE`)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:run -- deployConfig`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: add README and GitHub Pages deployment workflow with SPA fallback"
```

---

### Task 32: End-to-end tests in a real browser (§23)

**Files:**
- Create: `playwright.config.ts`, `e2e/workoutLogging.spec.ts`, `e2e/backupRestore.spec.ts`, `e2e/offlineInstall.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Install the browser**

Run: `npx playwright install chromium`
Expected: Chromium downloaded. If the download is blocked, stop and report it rather than silently skipping — do not claim E2E coverage that did not run.

- [ ] **Step 2: Write the config**

`playwright.config.ts`: `testDir: './e2e'`, Chromium only, `use: { ...devices['iPhone 13'] }` for a real mobile viewport, `webServer` running `npm run preview` against the production build on port 4173, `reporter: 'list'`, `retries: 0`.

- [ ] **Step 3: Write the critical mobile workout-logging spec**

`e2e/workoutLogging.spec.ts`:
1. Complete onboarding: pick a race date 26 weeks out, accept the prefilled profile, accept the 1:35 goal.
2. Assert Home shows all three sections and today's workout.
3. Start today's workout. Assert every exercise is expanded and the previous/target block is visible without any tap.
4. Log the first set with one tap on its complete control. Assert the rest timer bar appears with the seeded rest duration.
5. Type a weight into set 2, then **reload the page**. Assert the workout is still in progress, the typed weight is still present, and the rest timer shows a correctly decremented remainder.
6. Complete the remaining sets, enter symptoms, and choose Partially completed. Assert Home reports a partially completed session and does **not** report it as completed.
7. Assert no horizontal scrolling occurred at the iPhone viewport.

- [ ] **Step 4: Write the backup round-trip spec**

`e2e/backupRestore.spec.ts`: log a workout; export the backup and capture the downloaded file; reset all data through the confirmation flow; assert the app is empty; import the captured file; assert the logged workout, its sets, and its symptom log are all restored. Then attempt to import a deliberately corrupted file and assert a specific error appears and the restored data is still intact.

- [ ] **Step 5: Write the offline and install spec**

`e2e/offlineInstall.spec.ts`: load the app; wait for the service worker to activate; assert the manifest is served with a correct `start_url` and that the icons return 200; set `context.setOffline(true)`; reload; assert the app still renders Home from the cache with no network; navigate between tabs offline; assert a deep route reload offline still renders (the `404.html`/navigateFallback path).

- [ ] **Step 6: Run the suite**

Run: `npm run build`
Expected: succeeds.

Run: `npm run e2e`
Expected: all specs pass. Report the actual output.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: add Playwright specs for mobile logging, backup round trip, and offline install"
```

---

### Task 33: Final verification, review, and mobile UX audit

**Files:** whatever the audit requires.

- [ ] **Step 1: Run every gate and record the real output**

```bash
npm run lint
```
```bash
npm run typecheck
```
```bash
npm run test:run
```
```bash
npm run build
```
```bash
npm run e2e
```

Expected: all five pass with zero errors. Fix every failure and every material warning. Do not proceed while any gate is red.

- [ ] **Step 2: Verify the spec coverage matrix**

Walk the design spec section by section and confirm a shipped, tested implementation for each. Any gap is a bug to fix, not a note to write. Pay particular attention to the requirements that are easy to leave half-done: all five completion states, all three edit scopes, all eight stations, all twelve milestones, all nine schedule statuses, the four-session minimum display, the one-rest-day invariant, and the explanation strings.

- [ ] **Step 3: Confirm every interactive control actually works**

Enumerate every button, link, input, and toggle in the app and confirm each performs its action against the database. Any control that renders but does nothing is a defect — the Global Constraints forbid fake buttons.

- [ ] **Step 4: Confirm persistence and data safety by hand**

Using `npm run dev` in a browser: start a workout, enter partial data, refresh, confirm recovery. Start a rest timer, navigate, refresh, confirm accuracy. Export a backup, reset, import, confirm restoration. Confirm an update does not clear IndexedDB.

- [ ] **Step 5: Mobile UX audit at 375px**

Confirm: no horizontal scrolling on any screen; every interactive target ≥44×44px; every input ≥16px font; safe-area insets respected top and bottom; charts legible; contrast meets AA; keyboard navigation reaches set completion and all nav; no colour-only status.

- [ ] **Step 6: Invoke the verification and code review skills**

Use `superpowers:verification-before-completion` before making any completion claim, then `superpowers:requesting-code-review` for the final review. Address the findings.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: final verification, code review fixes, and mobile UX audit"
```

---

## Self-Review

**Spec coverage.** Every numbered section of the design spec maps to at least one task: §0 preflight → Task 1; §1 decisions D1→11, D2→7, D3→16, D4→15, D5→15, D6→4, D7→15, D8→10, D9→30, D10→23, D11→8/23, D12→6, D13→8, D14→12/24, D15→12, D16→19; §2 architecture → 1–3, 18; §3 data model → 13, 16; §4.1–4.2 queue → 9, 10; §4.3 recommendations → 7; §4.4 pace → 5; §4.5 symptoms → 8; §4.6 milestones → 12; §5 screens → 18–29; §6 visual design → 2, 30; §7 PWA/backup → 17, 30; §8 seed plan → 14, 15; §9 testing → every task plus 32; §10 documentation → 31; §11 non-goals → Global Constraints; §12 limitations → 31, 33.

**Every §23 required test** has a named home: strength recommendations and initial fallback and RIR progression → 7; pace → 5; interval splits → 5; symptom trend flags → 8; queue recomputation, missed essential, missed optional, optional dropping, recovery conflicts, backdated completion, partial completion, race-date anchoring, manual overrides, no double-workout catch-up, one-rest-day rule → 9, 10; template edits not changing completed records and exercise-default changes → 16, 27; rest timer persistence → 16, 20; backup round trip and invalid rejection → 17, 29; schema migrations → 13; critical mobile workout-logging flow → 21, 32.

**Type consistency checked.** `QueueTemplate.templateId` is the queue's stable key throughout Tasks 9, 10, and 16. `SessionPerformance` is defined in Task 6 and reused by Task 16's `exerciseHistory` and Task 25. `RecommendationSymptomState` (Task 7) is structurally satisfied by `SymptomState` (Task 8) — Task 8 must not narrow those three fields. `SymptomState.shin`/`sciatic` are `StreamState`, used identically in Tasks 7, 8, 23, and 24. `goalTargets` returns `GoalTargets` consumed by Tasks 12, 22, 26, and 29. `EditScope` is defined in Task 3 and consumed by Tasks 16, 27, and 28.

**No placeholders.** No task contains TBD, "add error handling", or "similar to Task N".

