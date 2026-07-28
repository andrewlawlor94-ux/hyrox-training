import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { resetDatabase } from '@/data/db'
import { updateSettings } from '@/data/repositories'
import { renderApp } from '@/test/renderApp'
import { seedTestDb } from '@/test/seedTestDb'

const NOW = '2026-01-05T08:00:00.000Z'

// Kept in its own file: `vi.mock` is hoisted and applies to every test in
// the file it's declared in, and this one needs Home to throw on every
// render — doing that inside shell.test.tsx would break every other test
// there that expects a real Home screen.
vi.mock('@/features/shell/HomeScreen', () => ({
  HomeScreen: () => {
    throw new Error('boom: forced render failure to prove per-route ErrorBoundary wiring')
  },
}))

beforeEach(async () => {
  await resetDatabase()
})

describe('per-route ErrorBoundary wiring', () => {
  it('catches an error thrown inside one route without taking down the nav', async () => {
    await seedTestDb()
    await updateSettings({ onboardingCompletedAt: NOW })
    renderApp({ route: '/' })

    // ErrorBoundary's fallback title is a <p>, not a heading — matched by
    // text here rather than role.
    await screen.findByText(/something went wrong/i)

    // The nav lives outside the failing route's own <ErrorBoundary>, so it
    // survives — and is still usable — even though Home crashed.
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(within(nav).getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Home' })).toBeInTheDocument()
  })
})
