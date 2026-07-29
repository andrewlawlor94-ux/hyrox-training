import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { resetDatabase } from '@/data/db'
import { updateSettings } from '@/data/repositories'
import { renderApp } from '@/test/renderApp'

const NOW = '2026-01-05T08:00:00.000Z'

// Kept in its own file, like `shellAppShellErrorBoundary.test.tsx`: `vi.mock`
// is hoisted and applies to every test in the file it's declared in. Making
// the *module itself* throw on evaluation is the same failure shape a real
// chunk-load failure has -- an offline athlete whose `/progress` chunk was
// never precached gets a network error at the same `import()` call
// `router.tsx`'s `lazy(() => import(...))` makes, not a thrown-after-load
// component error.
vi.mock('@/features/progress/ProgressScreen', () => {
  throw new Error('boom: simulated chunk-load failure (e.g. offline with an uncached Progress chunk)')
})

describe('Progress route: lazy-chunk load failure', () => {
  it('surfaces the shared route ErrorBoundary fallback instead of leaving the Suspense fallback stuck or blanking the screen', async () => {
    await resetDatabase()
    await updateSettings({ onboardingCompletedAt: NOW })

    renderApp({ route: '/progress' })

    // Before this fix, a failed chunk fetch had nothing above the lazy
    // component to catch it: React unmounts the whole tree on an uncaught
    // render error, leaving a blank <body>.
    await screen.findByText(/something went wrong/i)
    expect(document.body.textContent).not.toBe('')
    expect(screen.queryByText('Loading…')).toBeNull()
  })
})
