/**
 * Stands in for `virtual:pwa-register`, the module vite-plugin-pwa's client
 * only provides inside an actual Vite/PWA build pipeline (vitest.config.ts
 * deliberately doesn't load the VitePWA plugin — see its own comment on
 * `resolve.alias`). This lets `src/pwa.ts` resolve at all under Vitest;
 * `src/features/shell/__tests__/updatePrompt.test.tsx`, the one test file
 * that actually exercises the update flow, replaces this with its own
 * `vi.mock('virtual:pwa-register', ...)`. This default implementation is a
 * no-op so any *other* file that happens to import `@/pwa` without caring
 * about updates doesn't need to know any of this — it ignores whatever
 * options it's called with (JS ignores excess call-site arguments, so this
 * still satisfies callers passing `RegisterSWOptions` without importing that
 * type just to name an unused parameter).
 */
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return async () => {}
}
