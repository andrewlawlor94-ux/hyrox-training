import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db, resetDatabase } from '@/data/db'
import { updateSettings } from '@/data/repositories'
import { renderApp } from '@/test/renderApp'
import { seedTestDb } from '@/test/seedTestDb'

const FAKE_NOW = new Date(2026, 0, 5, 8, 0, 0)
// Derived from FAKE_NOW rather than hardcoded: a literal UTC string here
// would only match `new Date().toISOString()` (what the component actually
// calls under the faked local time) on a machine whose timezone offset
// happens to be zero — everywhere else it silently drifts by the offset.
const NOW = FAKE_NOW.toISOString()

async function onboard(): Promise<void> {
  await updateSettings({ onboardingCompletedAt: NOW })
}

async function renderSettings(): Promise<void> {
  renderApp({ route: '/settings' })
  await screen.findByRole('heading', { level: 1, name: /settings/i })
}

beforeEach(async () => {
  await resetDatabase()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
  // jsdom implements neither of these — every real browser does — so the
  // download path (Export) and the anchor `.click()` it triggers don't
  // throw. The click is stubbed too so no "Not implemented: navigation"
  // jsdom console noise leaks into the test output.
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  Object.defineProperty(window.navigator, 'storage', { value: undefined, configurable: true })
})

describe('Backup & restore: plain-language note', () => {
  it('shows a short note about locally-stored data being at risk', async () => {
    await seedTestDb()
    await onboard()
    await renderSettings()
    expect(screen.getByText(/only keeps your training data on this device/i)).toBeInTheDocument()
    expect(screen.getByText(/erase it for good/i)).toBeInTheDocument()
  })
})

describe('Backup & restore: storage status', () => {
  it('reports "not supported" when navigator.storage is absent', async () => {
    await seedTestDb()
    await onboard()
    await renderSettings()
    expect(await screen.findByText(/not supported/i)).toBeInTheDocument()
  })

  it('reports granted persistent storage when navigator.storage.persist() resolves true', async () => {
    Object.defineProperty(window.navigator, 'storage', {
      value: { persist: () => Promise.resolve(true) },
      configurable: true,
    })
    await seedTestDb()
    await onboard()
    await renderSettings()
    expect(await screen.findByText(/persistent storage.*granted/i)).toBeInTheDocument()
  })

  it('reports not granted when navigator.storage.persist() resolves false', async () => {
    Object.defineProperty(window.navigator, 'storage', {
      value: { persist: () => Promise.resolve(false) },
      configurable: true,
    })
    await seedTestDb()
    await onboard()
    await renderSettings()
    expect(await screen.findByText(/persistent storage.*not granted/i)).toBeInTheDocument()
  })
})

describe('Backup & restore: export', () => {
  it('shows "No backup yet" before any export, then records and displays lastBackupAt after exporting', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderSettings()

    expect(screen.getByText(/no backup yet/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /export backup/i }))

    await waitFor(async () => {
      const settings = await db.settings.get('app')
      expect(settings?.lastBackupAt).toBe(NOW)
    })
    // The DB write above and the component's re-render from its live query
    // are two separate async steps — poll for the rendered text too rather
    // than asserting immediately after the first `waitFor` resolves.
    expect(await screen.findByText(/last backup/i)).toBeInTheDocument()
    expect(screen.queryByText(/no backup yet/i)).not.toBeInTheDocument()
  })
})

describe('Backup & restore: import', () => {
  it('reports counts on a successful import', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    const { exportBackup } = await import('@/data/backup/exportBackup')
    const { json } = await exportBackup(NOW, '1.0.0')
    await renderSettings()

    const file = new File([json], 'backup.json', { type: 'application/json' })
    const input = screen.getByLabelText(/import backup/i)
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/imported/i)).toBeInTheDocument()
  })

  it('shows the specific validation message on a corrupted file, and leaves data untouched', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderSettings()

    const before = await db.workoutInstances.count()
    const file = new File(['not valid json'], 'backup.json', { type: 'application/json' })
    const input = screen.getByLabelText(/import backup/i)
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/not valid json/i)).toBeInTheDocument()
    expect(await db.workoutInstances.count()).toBe(before)
  })
})

describe('Backup & restore: restore original plan', () => {
  it('restores the seed 24-week plan while preserving completed history', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderSettings()

    const completedBefore = await db.workoutInstances.where('status').equals('completed').count()
    expect(completedBefore).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /restore.*original.*plan/i }))

    await waitFor(async () => {
      const completedAfter = await db.workoutInstances.where('status').equals('completed').count()
      expect(completedAfter).toBe(completedBefore)
    })
  })
})

describe('Backup & restore: reset application data', () => {
  it('keeps the reset button disabled until the exact confirmation phrase is typed', async () => {
    await seedTestDb()
    await onboard()
    await renderSettings()

    const resetButton = screen.getByRole('button', { name: /reset application data/i })
    expect(resetButton).toBeDisabled()

    const confirmInput = screen.getByLabelText(/type.*confirm/i)
    fireEvent.change(confirmInput, { target: { value: 'nope' } })
    expect(resetButton).toBeDisabled()

    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
    expect(resetButton).toBeEnabled()
  })

  it('wipes every table when confirmed', async () => {
    // `window.location.reload` is non-configurable in jsdom (Object.defineProperty
    // throws "Cannot redefine property"), so it can't be spied on — but calling
    // the real one here is harmless: jsdom logs an internal "Not implemented:
    // navigation" notice for it rather than throwing, and by the time it's
    // called `resetDatabase` has already run, which is the only side effect
    // this test cares about.
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderSettings()

    expect(await db.workoutInstances.count()).toBeGreaterThan(0)

    const confirmInput = screen.getByLabelText(/type.*confirm/i)
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
    const resetButton = screen.getByRole('button', { name: /reset application data/i })
    fireEvent.click(resetButton)

    await waitFor(async () => {
      expect(await db.workoutInstances.count()).toBe(0)
    })
    expect(await db.plans.count()).toBe(0)
  })
})
