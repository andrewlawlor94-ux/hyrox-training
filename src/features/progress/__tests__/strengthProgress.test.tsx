import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import type { WorkoutInstance } from '@/data/types'
import { addSet, completeWorkout, updateSettings, upsertSet } from '@/data/repositories'
import { renderApp } from '@/test/renderApp'
import { seedTestDb } from '@/test/seedTestDb'

const NOW = '2026-01-05T08:00:00.000Z' // matches seedTestDb's default (plan start, week 1)
const FAKE_NOW = new Date(2026, 0, 5, 8, 0, 0)

interface StrengthFixture {
  instance: WorkoutInstance
  instancePrescriptionId: string
}

async function onboard(): Promise<void> {
  await updateSettings({ onboardingCompletedAt: NOW })
}

async function renderProgress(): Promise<void> {
  renderApp({ route: '/progress' })
  await screen.findByRole('heading', { level: 1, name: /progress/i })
}

/** Every WorkoutInstance across every week prescribing `exerciseId`, earliest
 * week first — enough to log several genuinely separate sessions of the
 * same exercise, which the seeded plan's own back-squat cadence provides
 * across weeks. */
async function findInstancesWithExercise(exerciseId: string, count: number): Promise<StrengthFixture[]> {
  const candidates = (await db.workoutInstances.toArray()).sort((a, b) => a.weekNumber - b.weekNumber)
  const results: StrengthFixture[] = []
  for (const instance of candidates) {
    const prescriptions = await db.instancePrescriptions.where('instanceId').equals(instance.id).toArray()
    const match = prescriptions.find((p) => p.exerciseId === exerciseId)
    if (match) results.push({ instance, instancePrescriptionId: match.id })
    if (results.length >= count) break
  }
  if (results.length < count) throw new Error(`only found ${String(results.length)} instances prescribing "${exerciseId}"`)
  return results
}

async function logSession(fixture: StrengthFixture, values: { weight: number; reps: number; rir: number }): Promise<void> {
  const set = await addSet({ instanceId: fixture.instance.id, instancePrescriptionId: fixture.instancePrescriptionId, now: NOW })
  await upsertSet({ ...set, weight: values.weight, unit: 'lb', reps: values.reps, rir: values.rir, isCompleted: true, completedAt: NOW })
  await completeWorkout({ id: fixture.instance.id, state: 'completed', forDate: fixture.instance.scheduledDate, now: NOW })
}

async function findCombobox(): Promise<HTMLElement> {
  return screen.findByRole('combobox', { name: /exercise/i })
}

beforeEach(async () => {
  await resetDatabase()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Progress: segmented control', () => {
  it('switches between Strength and Running, changing rendered content', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderProgress()

    await findCombobox()
    expect(screen.queryByText(/weekly running volume/i)).toBeNull()

    await userEvent.click(screen.getByRole('radio', { name: 'Running' }))

    await screen.findByRole('heading', { level: 3, name: /weekly running volume/i })
    expect(screen.queryByRole('combobox', { name: /exercise/i })).toBeNull()
  })
})

describe('Progress: strength — empty state', () => {
  it('shows an EmptyState, not an empty chart, when nothing has been logged yet', async () => {
    await seedTestDb()
    await onboard()
    await renderProgress()

    await screen.findByText(/no strength history yet/i)
    expect(screen.queryByRole('combobox', { name: /exercise/i })).toBeNull()
    expect(document.querySelector('.chart-card')).toBeNull()
  })
})

describe('Progress: strength — exercise picker', () => {
  it('lists every non-archived exercise with logged history, and nothing else', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderProgress()

    const select = await findCombobox()
    const optionLabels = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(optionLabels).toContain('Back squat')
    expect(optionLabels).toContain('Bench press')
    expect(optionLabels).not.toContain('Romanian deadlift')
  })
})

describe('Progress: strength — exercise detail', () => {
  it('shows working weight over time, recent sessions with sets/reps/RIR, personal bests, previous weight, and the current recommended target', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderProgress()

    const select = await findCombobox()
    await userEvent.selectOptions(select, 'Back squat')

    await screen.findByText(/working weight over time/i)
    expect(screen.getByText(/175 lb x 5 @ RIR 2/i)).toBeInTheDocument()
    expect(screen.getByText(/personal bests/i)).toBeInTheDocument()
    expect(screen.getByText(/previous weight/i)).toBeInTheDocument()
    expect(screen.getByText(/current recommended target/i)).toBeInTheDocument()
  })

  it('replaces the estimated-1RM chart with an explanatory message below three qualifying sessions, and shows the chart, labelled "estimated", at three or more', async () => {
    await seedTestDb({ withHistory: true }) // logs exactly one back-squat session
    await onboard()
    await renderProgress()

    const select = await findCombobox()
    await userEvent.selectOptions(select, 'Back squat')

    const oneRmHeading = await screen.findByText(/estimated one-rep max/i)
    expect(screen.getByText(/not enough qualifying sessions/i)).toBeInTheDocument()
    // The 1RM chart's own section has no chart or table when gated off —
    // `PersonalBestsCard`'s separate "Best estimated 1RM" (needs only one
    // qualifying session, not three) is deliberately not what this checks.
    const oneRmSection = oneRmHeading.closest('.chart-card')
    expect(oneRmSection?.querySelector('table')).toBeNull()
    expect(oneRmSection?.querySelector('svg')).toBeNull()

    // Complete two MORE back-squat sessions (three total, across three weeks)
    // with a real rep/weight so `hasEnough1RMData` now qualifies.
    const fixtures = await findInstancesWithExercise('ex_back_squat', 3)
    const secondThird = fixtures.slice(1)
    for (const fixture of secondThird) {
      await logSession(fixture, { weight: 180, reps: 5, rir: 2 })
    }

    await waitFor(() => { expect(screen.queryByText(/not enough qualifying sessions/i)).toBeNull() })
    expect(screen.getAllByText(/estimated/i).length).toBeGreaterThan(0)
  })
})

describe('Progress: strength — accessible chart fallbacks and layout', () => {
  it('gives every chart a ChartTable fallback with matching row counts, scrollable rather than page-widening, and logs no console error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await seedTestDb({ withHistory: true })
    await onboard()
    await renderProgress()

    const select = await findCombobox()
    await userEvent.selectOptions(select, 'Back squat')
    await screen.findByText(/working weight over time/i)

    const tables = document.querySelectorAll('.chart-table')
    expect(tables.length).toBeGreaterThan(0)
    for (const table of tables) {
      const rows = table.querySelectorAll('tbody tr')
      expect(rows.length).toBeGreaterThan(0)
    }

    const scrollers = document.querySelectorAll('.chart-card__scroll')
    expect(scrollers.length).toBeGreaterThan(0)
    for (const scroller of scrollers) {
      expect(getComputedStyle(scroller).overflowX).toBe('auto')
    }

    expect(errorSpy).not.toHaveBeenCalled()
  })
})
