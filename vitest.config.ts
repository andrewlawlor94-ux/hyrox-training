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
  },
})
