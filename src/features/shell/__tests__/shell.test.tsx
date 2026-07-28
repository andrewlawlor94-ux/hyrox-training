import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDatabase } from '@/data/db'
import type * as DbModule from '@/data/db'
import { DbUnavailableError } from '@/data/errors'
import { updateSettings } from '@/data/repositories'
import { renderApp } from '@/test/renderApp'
import { seedTestDb } from '@/test/seedTestDb'

const NOW = '2026-01-05T08:00:00.000Z'

// Partial mock: every real export (including `resetDatabase`, whose own
// internal call to `openDb` is a live binding inside the pristine original
// module and is therefore unaffected by this wrapper) passes through except
// `openDb`, which becomes a spy defaulting to the real implementation so
// individual tests can override it with a one-time rejection.
vi.mock('@/data/db', async (importOriginal) => {
  const actual = await importOriginal<typeof DbModule>()
  return { ...actual, openDb: vi.fn(actual.openDb) }
})

async function mockedOpenDb(): Promise<Mock> {
  const dbModule = await import('@/data/db')
  return dbModule.openDb as unknown as Mock
}

/**
 * jsdom does not implement CSS custom-property substitution in
 * `getComputedStyle` (verified empirically: a rule using `var(--x)` reports
 * back the literal string `"var(--x)"`, never a resolved pixel value). A
 * test that only checked a class name was present could never fail if the
 * CSS forgot to set `min-height` at all — this instead resolves the
 * variable by hand against the root's own computed custom property, which
 * DOES fail if the rule is missing, misnamed, or absent.
 */
function resolvedPx(element: Element, property: string): number {
  const raw = getComputedStyle(element).getPropertyValue(property).trim()
  const varMatch = /^var\((--[\w-]+)\)$/.exec(raw)
  const varName = varMatch?.[1]
  const value = varName ? getComputedStyle(document.documentElement).getPropertyValue(varName).trim() : raw
  return Number.parseFloat(value)
}

beforeEach(async () => {
  await resetDatabase()
})

describe('app shell', () => {
  it('renders exactly two bottom-nav destinations, Home and Settings, as accessible links', async () => {
    await seedTestDb()
    await updateSettings({ onboardingCompletedAt: NOW })
    renderApp({ route: '/' })

    await screen.findByRole('heading', { name: /home/i })
    const nav = screen.getByRole('navigation', { name: /primary/i })
    const links = within(nav).getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(within(nav).getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  it('has no hamburger menu anywhere in the tree', async () => {
    await seedTestDb()
    await updateSettings({ onboardingCompletedAt: NOW })
    renderApp({ route: '/' })

    await screen.findByRole('heading', { name: /home/i })
    expect(screen.queryByRole('button', { name: /menu/i })).toBeNull()
  })

  it('marks the current route\'s nav item aria-current="page" and moves it on click', async () => {
    await seedTestDb()
    await updateSettings({ onboardingCompletedAt: NOW })
    renderApp({ route: '/' })

    await screen.findByRole('heading', { name: /home/i })
    const homeLink = screen.getByRole('link', { name: 'Home' })
    const settingsLink = screen.getByRole('link', { name: 'Settings' })
    expect(homeLink).toHaveAttribute('aria-current', 'page')
    expect(settingsLink).not.toHaveAttribute('aria-current', 'page')

    await userEvent.click(settingsLink)

    await screen.findByRole('heading', { name: /settings/i })
    expect(settingsLink).toHaveAttribute('aria-current', 'page')
    expect(homeLink).not.toHaveAttribute('aria-current', 'page')
  })

  it('gives every nav link a computed min-height of at least 44px, backed by --tap-min', async () => {
    await seedTestDb()
    await updateSettings({ onboardingCompletedAt: NOW })
    renderApp({ route: '/' })

    await screen.findByRole('heading', { name: /home/i })
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(resolvedPx(link, 'min-height')).toBeGreaterThanOrEqual(44)
    }
  })

  it('redirects to /onboarding from any route when onboardingCompletedAt is unset', async () => {
    await seedTestDb()
    renderApp({ route: '/settings' })

    // The onboarding wizard's first step heading is "Race date" (Task 19),
    // not the literal word "onboarding" — this asserts the redirect landed
    // on the onboarding route's actual first screen.
    await screen.findByRole('heading', { name: /race date/i })
    expect(screen.queryByRole('navigation', { name: /primary/i })).toBeNull()
  })

  it('renders Home without redirecting when onboardingCompletedAt is set', async () => {
    await seedTestDb()
    await updateSettings({ onboardingCompletedAt: NOW })
    renderApp({ route: '/' })

    await screen.findByRole('heading', { name: /home/i })
    expect(screen.queryByRole('heading', { name: /onboarding/i })).toBeNull()
  })

  it('never blank-screens on a quotaExceeded DbUnavailableError — shows DbErrorScreen with Retry and Export', async () => {
    const openDb = await mockedOpenDb()
    openDb.mockRejectedValueOnce(new DbUnavailableError('quotaExceeded'))

    renderApp({ route: '/' })

    await screen.findByRole('heading', { name: /storage is full/i })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export what we can/i })).toBeInTheDocument()
  })

  it.each([
    ['upgradeBlocked', /update blocked/i],
    ['accessDenied', /storage access denied/i],
    ['unknown', /training log unavailable/i],
  ] as const)('shows kind-specific copy for a %s failure, still with Retry and Export', async (kind, titlePattern) => {
    const openDb = await mockedOpenDb()
    openDb.mockRejectedValueOnce(new DbUnavailableError(kind))

    renderApp({ route: '/' })

    await screen.findByRole('heading', { name: titlePattern })
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export what we can/i })).toBeInTheDocument()
  })

  it('applies a shell padding-bottom accounting for both --nav-height and --safe-bottom', async () => {
    await seedTestDb()
    await updateSettings({ onboardingCompletedAt: NOW })
    const { container } = renderApp({ route: '/' })

    await screen.findByRole('heading', { name: /home/i })
    const main = container.querySelector('.app-shell__main')
    expect(main).not.toBeNull()
    const raw = getComputedStyle(main as Element).getPropertyValue('padding-bottom')
    expect(raw).toContain('--nav-height')
    expect(raw).toContain('--safe-bottom')
  })
})

describe('BootGate retry', () => {
  it('recovers once Retry succeeds after an initial failure', async () => {
    await seedTestDb()
    await updateSettings({ onboardingCompletedAt: NOW })

    const openDb = await mockedOpenDb()
    openDb.mockRejectedValueOnce(new DbUnavailableError('unknown'))

    renderApp({ route: '/' })

    await screen.findByRole('heading', { name: /training log unavailable/i })
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /home/i })).toBeInTheDocument()
    })
  })
})
