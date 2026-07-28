import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // vite-plugin-pwa's real `virtual:pwa-register` module only resolves
      // inside an actual Vite/PWA build pipeline — this config deliberately
      // doesn't load the VitePWA plugin itself (doing so pulls in the same
      // esbuild/jsdom TextEncoder incompatibility documented in
      // src/__tests__/pwaConfig.test.ts, project-wide instead of in one
      // file). Aliasing the specifier to a real, tiny stub module gives
      // src/pwa.ts something to resolve under Vitest; see
      // src/test/pwaRegisterStub.ts.
      'virtual:pwa-register': fileURLToPath(new URL('./src/test/pwaRegisterStub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // '.claude/**' matters beyond tidiness: a concurrent session's git
    // worktree can live at .claude/worktrees/**, nested inside this
    // worktree's own root, with its own node_modules — 'node_modules/**'
    // alone only excludes the top-level one, so without this Vitest's
    // default recursive glob picks up and runs that worktree's dependency
    // test suites too.
    exclude: ['e2e/**', 'node_modules/**', '.claude/**'],
    coverage: { provider: 'v8', reportsDirectory: './coverage' },
    // Real stylesheet rules (not just class names) back the ≥44px tap-target
    // and ≥16px input-font-size accessibility assertions — those checks are
    // worthless against a class name alone, so CSS must actually apply.
    css: true,
    // Vitest's 5s default is sized for pure unit tests. A large share of this
    // suite drives the real Dexie/IndexedDB stack through React — installing a
    // 27-week plan materializes ~150 workout instances and ~500 prescriptions
    // — and those files pass comfortably in isolation while individually
    // exceeding 5s once several workers contend for cores. Raising the budget
    // fixes the contention flake without hiding it: a genuine performance
    // regression still has to blow through 20s to go unnoticed, and CI runs on
    // fewer cores than a dev box so the headroom matters more there.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Capped deliberately. Vitest defaults to roughly one worker per core, and
    // on a 22-core machine that spawned ~21 workers each running jsdom plus a
    // fake-indexeddb database plus a full 27-week plan install. The thrash — not
    // any logic — pushed individual tests past their timeout, so the suite was
    // green in isolation and red under load. Four workers makes it deterministic
    // at a modest wall-clock cost, which is strictly better than fast and flaky:
    // an intermittently red suite stops anyone trusting a genuine failure. CI
    // runners have fewer cores than this, so the cap is a no-op there.
    maxWorkers: 4,
  },
})
