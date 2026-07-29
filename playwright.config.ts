import { defineConfig, devices } from '@playwright/test'
import { BASE_PATH, BASE_URL, PORT } from './e2e/constants'

/**
 * Real-browser end-to-end coverage (§23) — the layer that has actually
 * caught every serious defect on this project (a blank first launch, a
 * one-tap set that logged completion but not weight/reps, StrictMode
 * double-invoke breaking strength cards, empty Base-week prescriptions,
 * horizontal scroll from sub-44px targets). None of the 900+ Vitest/RTL
 * tests below this ever drove a real IndexedDB, a real service worker, or a
 * real mobile viewport — this config is what does.
 *
 * `iPhone 13` (not a desktop viewport): the athlete uses this app on a phone
 * mid-workout, and the horizontal-scroll defect above only ever showed up at
 * a real mobile width.
 */
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  retries: 0,
  // Generous, not lenient: onboarding alone materializes a real 24-week plan
  // in a real IndexedDB (up to 20s), and the workout-logging spec waits out
  // real elapsed rest-timer seconds on top of that — the default 30s budget
  // is too tight for genuine wall-clock waits, not for a slow assertion.
  timeout: 90_000,
  use: {
    baseURL: BASE_URL,
  },
  projects: [
    // `devices['iPhone 13']` defaults to WebKit (it models Mobile Safari) --
    // `browserName: 'chromium'` overrides that so the viewport/UA are a real
    // iPhone's while the engine stays Chromium-only, as required.
    { name: 'chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    // The production build, never `vite dev` (whose HMR client logs
    // warnings the shipped app never produces) — and always a FRESH build
    // (`reuseExistingServer: false`), never a server left over from a
    // previous run, since a stale bundle behind an already-registered
    // service worker is exactly the false-pass this suite must not produce.
    command: `npm run build && npm run preview -- --port ${String(PORT)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_BASE: BASE_PATH },
  },
})
