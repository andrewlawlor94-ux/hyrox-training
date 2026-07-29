import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db, resetDatabase } from '@/data/db'
import { updateSettings } from '@/data/repositories'
import { BACKUP_TABLES } from '@/domain/backup/constants'
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
  // SafetySnapshotPanel resolves its snapshot lookup asynchronously on
  // mount; waiting for it here (rather than in every test) keeps that
  // resolution inside `act` instead of leaking a warning into later tests.
  await screen.findByRole('heading', { name: /pre-import snapshot/i })
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
  it('stages a valid file behind a confirmation showing current-vs-file counts, and writes nothing until confirmed', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    const { exportBackup } = await import('@/data/backup/exportBackup')
    const { json } = await exportBackup(NOW, '1.0.0')
    await renderSettings()

    const before = await db.workoutInstances.count()
    const file = new File([json], 'backup.json', { type: 'application/json' })
    const input = screen.getByLabelText(/import backup/i)
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByRole('heading', { name: /replace all data on this device/i })).toBeInTheDocument()
    // Nothing has been written yet — only a real confirm-tap triggers importBackup.
    expect(await db.workoutInstances.count()).toBe(before)

    fireEvent.click(screen.getByRole('button', { name: /import and replace/i }))

    expect(await screen.findByText(/imported/i)).toBeInTheDocument()
  })

  it('cancelling the confirmation writes nothing', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    const { exportBackup } = await import('@/data/backup/exportBackup')
    const { json } = await exportBackup(NOW, '1.0.0')
    await renderSettings()

    const before = await db.workoutInstances.count()
    const file = new File([json], 'backup.json', { type: 'application/json' })
    const input = screen.getByLabelText(/import backup/i)
    fireEvent.change(input, { target: { files: [file] } })
    await screen.findByRole('heading', { name: /replace all data on this device/i })

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByRole('heading', { name: /replace all data on this device/i })).not.toBeInTheDocument()
    expect(await db.workoutInstances.count()).toBe(before)
  })

  it('shows the specific validation message on a corrupted file, with no confirmation step, and leaves data untouched', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderSettings()

    const before = await db.workoutInstances.count()
    const file = new File(['not valid json'], 'backup.json', { type: 'application/json' })
    const input = screen.getByLabelText(/import backup/i)
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/not valid json/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /replace all data on this device/i })).not.toBeInTheDocument()
    expect(await db.workoutInstances.count()).toBe(before)
  })

  it('requires typing REPLACE before an all-empty file can be imported over real data, and refuses it until typed', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderSettings()

    const before = await db.workoutInstances.count()
    expect(before).toBeGreaterThan(0)

    const emptyBackup = {
      format: 'hyrox-training-backup',
      schemaVersion: 1,
      appVersion: '1.0.0',
      exportedAt: NOW,
      counts: Object.fromEntries(BACKUP_TABLES.map((table) => [table, 0])),
      data: Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])),
    }
    const file = new File([JSON.stringify(emptyBackup)], 'empty.json', { type: 'application/json' })
    const input = screen.getByLabelText(/import backup/i)
    fireEvent.change(input, { target: { files: [file] } })

    await screen.findByRole('heading', { name: /replace all data on this device/i })
    const confirmButton = screen.getByRole('button', { name: /import and replace/i })
    expect(confirmButton).toBeDisabled()

    fireEvent.click(confirmButton)
    expect(await db.workoutInstances.count()).toBe(before)

    fireEvent.change(screen.getByLabelText(/type replace to confirm/i), { target: { value: 'REPLACE' } })
    expect(confirmButton).toBeEnabled()

    fireEvent.click(confirmButton)

    await waitFor(async () => {
      expect(await db.workoutInstances.count()).toBe(0)
    })
  })
})

describe('Backup & restore: pre-import snapshot (C3)', () => {
  it('reports no snapshot yet before any import has ever happened', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderSettings()

    expect(screen.getByText(/no snapshot yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restore snapshot/i })).not.toBeInTheDocument()
  })

  it('becomes reachable (exportable and restorable) once an import has written one', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    const { exportBackup } = await import('@/data/backup/exportBackup')
    const { json } = await exportBackup(NOW, '1.0.0')
    await renderSettings()

    const file = new File([json], 'backup.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText(/import backup/i), { target: { files: [file] } })
    await screen.findByRole('heading', { name: /replace all data on this device/i })
    fireEvent.click(screen.getByRole('button', { name: /import and replace/i }))
    await screen.findByText(/imported/i)

    // The snapshot is now a normal Settings item — visible without DevTools.
    expect(await screen.findByRole('button', { name: /export snapshot/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restore snapshot/i })).toBeInTheDocument()
    expect(screen.queryByText(/no snapshot yet/i)).not.toBeInTheDocument()
  })

  it('"Restore snapshot" recovers the pre-import state through the same staged confirmation as any other import', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    const originalWorkoutInstanceCount = await db.workoutInstances.count()

    const { exportBackup } = await import('@/data/backup/exportBackup')
    const { json: replacementJson } = await exportBackup(NOW, '1.0.0')
    const replacementBackup = JSON.parse(replacementJson) as { data: Record<string, unknown[]> }
    // A second, much smaller file — just the settings table's own row is
    // enough to be a structurally valid backup with far fewer records.
    const smallerBackup = {
      ...replacementBackup,
      counts: Object.fromEntries(BACKUP_TABLES.map((table) => [table, table === 'settings' ? 1 : 0])),
      data: Object.fromEntries(
        BACKUP_TABLES.map((table) => [table, table === 'settings' ? replacementBackup.data.settings : []]),
      ),
    }

    await renderSettings()
    const smallerFile = new File([JSON.stringify(smallerBackup)], 'smaller.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText(/import backup/i), { target: { files: [smallerFile] } })
    await screen.findByRole('heading', { name: /replace all data on this device/i })
    // Drastically smaller than what's on the device — the hard-confirm gate applies.
    fireEvent.change(screen.getByLabelText(/type replace to confirm/i), { target: { value: 'REPLACE' } })
    fireEvent.click(screen.getByRole('button', { name: /import and replace/i }))
    await waitFor(async () => { expect(await db.workoutInstances.count()).toBe(0) })

    // The snapshot now holds the pre-shrink state — restoring it should
    // bring the original workout instances back.
    fireEvent.click(await screen.findByRole('button', { name: /restore snapshot/i }))
    await screen.findByRole('heading', { name: /replace all data on this device/i })
    fireEvent.click(screen.getByRole('button', { name: /import and replace/i }))

    await waitFor(async () => {
      expect(await db.workoutInstances.count()).toBe(originalWorkoutInstanceCount)
    })
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
