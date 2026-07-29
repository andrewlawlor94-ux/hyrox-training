import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { db, resetDatabase } from '@/data/db'
import { updateSettings } from '@/data/repositories'
import { exportBackup } from '@/data/backup/exportBackup'
import { renderApp } from '@/test/renderApp'
import { seedTestDb } from '@/test/seedTestDb'

const NOW = '2026-01-06T09:00:00.000Z'
const APP_VERSION = '1.0.0'

async function goToOnboardingFirstStep(): Promise<void> {
  renderApp({ route: '/onboarding' })
  await screen.findByRole('heading', { name: /race date/i })
}

beforeEach(async () => {
  await resetDatabase()
})

/**
 * The gap this closes: `AppShell` redirects to `/onboarding` until
 * `settings.onboardingCompletedAt` is set, which is exactly the state a
 * fresh install, a new phone, or "Reset application data" leaves the
 * athlete in — precisely when a backup matters most, and precisely when
 * the existing Import control (behind Settings, behind the gate) is
 * unreachable. These tests drive the restore escape hatch from a database
 * that has never been onboarded at all, the same state a real fresh
 * install starts from.
 */
describe('onboarding: restore from a backup before onboarding is complete', () => {
  it('imports a valid backup from a completely empty database, lands in the app, and keeps logged history intact', async () => {
    // Build the backup on a "device" that already completed onboarding and
    // logged real history — the exact shape a real exported file has.
    await seedTestDb({ withHistory: true })
    await updateSettings({ onboardingCompletedAt: NOW })

    const originalStrengthSets = await db.strengthSets.toArray()
    expect(originalStrengthSets.length).toBeGreaterThan(0)
    const completedInstances = await db.workoutInstances.where('status').equals('completed').toArray()
    expect(completedInstances.length).toBeGreaterThan(0)
    for (const instance of completedInstances) expect(instance.frozen).toBe(true)

    const { json } = await exportBackup(NOW, APP_VERSION)

    // Simulate a new phone / a full wipe: nothing left, not even the
    // settings row or the seeded exercise library.
    await resetDatabase()

    await goToOnboardingFirstStep()

    const file = new File([json], 'hyrox-training-backup.json', { type: 'application/json' })
    const input = screen.getByLabelText(/restore backup/i)
    fireEvent.change(input, { target: { files: [file] } })

    // Restoring installs a whole plan's worth of instances/prescriptions —
    // give it the same generous timeout the "finish onboarding" test uses.
    await screen.findByRole('heading', { name: /home/i }, { timeout: 5000 })

    const settings = await db.settings.get('app')
    expect(settings?.onboardingCompletedAt).toBe(NOW)

    const restoredStrengthSets = await db.strengthSets.toArray()
    for (const original of originalStrengthSets) {
      const restored = restoredStrengthSets.find((s) => s.id === original.id)
      expect(restored).toBeDefined()
      expect(restored?.weight).toBe(original.weight)
      expect(restored?.reps).toBe(original.reps)
    }
    for (const instance of completedInstances) {
      const restored = await db.workoutInstances.get(instance.id)
      expect(restored?.frozen).toBe(true)
      expect(restored?.completedAt).toBe(instance.completedAt)
    }
  })

  it('rejects a corrupted backup, shows the specific validation message, leaves the athlete on onboarding, and writes nothing', async () => {
    await goToOnboardingFirstStep()

    const settingsBefore = await db.settings.get('app')
    const workoutInstancesBefore = await db.workoutInstances.count()
    const exercisesBefore = await db.exercises.count()

    const file = new File(['not valid json'], 'hyrox-training-backup.json', { type: 'application/json' })
    const input = screen.getByLabelText(/restore backup/i)
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/not valid json/i)).toBeInTheDocument()
    // Still on the first onboarding step, free to try again or continue fresh.
    expect(screen.getByRole('heading', { name: /race date/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /home/i })).toBeNull()

    expect(await db.settings.get('app')).toEqual(settingsBefore)
    expect(await db.workoutInstances.count()).toBe(workoutInstancesBefore)
    expect(await db.exercises.count()).toBe(exercisesBefore)
    // The clearest proof of zero writes: importBackup only ever writes this
    // row once validation has already succeeded.
    expect(await db.safetyBackups.get('pre-import')).toBeUndefined()
  })
})
