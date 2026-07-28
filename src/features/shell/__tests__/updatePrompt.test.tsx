import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import { seedTestDb } from '@/test/seedTestDb'
import { initPwaUpdateWatcher, __resetPwaUpdateStateForTests } from '@/pwa'
import { UpdatePrompt } from '../UpdatePrompt'

/**
 * The only thing this file mocks is the true external boundary:
 * `virtual:pwa-register`, the module `vite-plugin-pwa`'s build injects and
 * that only really resolves inside an actual Vite/PWA build pipeline. `@/pwa`
 * and `UpdatePrompt` itself run for real, so "Update now" posting
 * SKIP_WAITING is verified by asserting the *real* code path calls the
 * function `registerSW` handed back — not by asserting our own mock of our
 * own code called itself.
 */
const updateServiceWorker = vi.fn(async () => {})
let capturedOnNeedRefresh: (() => void) | undefined

vi.mock('virtual:pwa-register', () => ({
  registerSW: (options?: { onNeedRefresh?: () => void }) => {
    capturedOnNeedRefresh = options?.onNeedRefresh
    return updateServiceWorker
  },
}))

function signalUpdateAvailable(): void {
  act(() => {
    capturedOnNeedRefresh?.()
  })
}

beforeEach(async () => {
  await resetDatabase()
  updateServiceWorker.mockClear()
  capturedOnNeedRefresh = undefined
  __resetPwaUpdateStateForTests()
})

describe('UpdatePrompt', () => {
  it('renders nothing when no update is waiting', () => {
    initPwaUpdateWatcher()
    render(<UpdatePrompt />)
    expect(screen.queryByRole('button', { name: /update now/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /later/i })).not.toBeInTheDocument()
  })

  it('shows Update now / Later, and states workout data is preserved, once the worker signals an update', () => {
    initPwaUpdateWatcher()
    render(<UpdatePrompt />)

    signalUpdateAvailable()

    expect(screen.getByRole('button', { name: /update now/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument()
    expect(screen.getByText(/workout history/i)).toBeInTheDocument()
  })

  it('"Update now" posts SKIP_WAITING (invokes the registered update function) exactly once', async () => {
    initPwaUpdateWatcher()
    render(<UpdatePrompt />)
    signalUpdateAvailable()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /update now/i }))

    expect(updateServiceWorker).toHaveBeenCalledTimes(1)
  })

  it('"Later" dismisses the card without ever invoking the update function', async () => {
    initPwaUpdateWatcher()
    render(<UpdatePrompt />)
    signalUpdateAvailable()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /later/i }))

    expect(screen.queryByRole('button', { name: /update now/i })).not.toBeInTheDocument()
    expect(updateServiceWorker).not.toHaveBeenCalled()
  })

  it('never touches IndexedDB: row counts across several tables are unchanged after "Update now"', async () => {
    await seedTestDb({ withHistory: true })

    const before = {
      strengthSets: await db.strengthSets.count(),
      runLogs: await db.runLogs.count(),
      symptomLogs: await db.symptomLogs.count(),
      workoutInstances: await db.workoutInstances.count(),
    }
    // Guard against a vacuous "unchanged" comparison: the fixture must have
    // actually written rows to every one of these tables.
    expect(before.strengthSets).toBeGreaterThan(0)
    expect(before.runLogs).toBeGreaterThan(0)
    expect(before.symptomLogs).toBeGreaterThan(0)
    expect(before.workoutInstances).toBeGreaterThan(0)

    initPwaUpdateWatcher()
    render(<UpdatePrompt />)
    signalUpdateAvailable()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /update now/i }))

    const after = {
      strengthSets: await db.strengthSets.count(),
      runLogs: await db.runLogs.count(),
      symptomLogs: await db.symptomLogs.count(),
      workoutInstances: await db.workoutInstances.count(),
    }
    expect(after).toEqual(before)
  })
})
