import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { resetDatabase } from '@/data/db'
import { renderApp } from '@/test/renderApp'

// Kept in its own file, like `shellErrorBoundary.test.tsx`: `vi.mock` is
// hoisted and applies to every test in the file it's declared in, and this
// one needs `useSettings` (which AppShell calls directly, not through a
// child route) to throw on every render.
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => {
    throw new Error('boom: forced AppShell render failure to prove the layout route has its own ErrorBoundary')
  },
}))

beforeEach(async () => {
  await resetDatabase()
})

describe('AppShell ErrorBoundary wiring', () => {
  it('renders a fallback instead of a blank page when AppShell itself throws', async () => {
    renderApp({ route: '/' })

    // Before this fix, AppShell sat outside every ErrorBoundary in
    // router.tsx, so an error here took the whole app down to an empty
    // <body> with no fallback at all.
    await screen.findByText(/something went wrong/i)
    expect(document.body.textContent).not.toBe('')
  })
})
