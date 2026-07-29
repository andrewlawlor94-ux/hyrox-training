import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import type { InstancePrescription, WorkoutInstance } from '@/data/types'
import { setRaceGoal, updateSettings } from '@/data/repositories'
import { renderApp } from '@/test/renderApp'
import { seedTestDb } from '@/test/seedTestDb'

const NOW = '2026-01-05T08:00:00.000Z' // matches seedTestDb's default (plan start, week 1)
const FAKE_NOW = new Date(2026, 0, 5, 8, 0, 0)

async function onboard(): Promise<void> {
  await updateSettings({ onboardingCompletedAt: NOW })
}

async function renderRunningProgress(): Promise<void> {
  renderApp({ route: '/progress' })
  await screen.findByRole('heading', { level: 1, name: /progress/i })
  await userEvent.click(screen.getByRole('radio', { name: 'Running' }))
  await screen.findByRole('heading', { level: 3, name: /weekly running volume/i })
}

/** Every week-`weekNumber` WorkoutInstance that prescribes at least one
 * `category: 'run'` exercise, paired with that first run prescription --
 * sequence order, so tests can deterministically pick "the first" and "the
 * second" without depending on iteration order of a Map/Set. */
async function runInstancesForWeek(weekNumber: number): Promise<{ instance: WorkoutInstance; prescription: InstancePrescription }[]> {
  const instances = (await db.workoutInstances.where('weekNumber').equals(weekNumber).toArray())
    .sort((a, b) => a.sequence - b.sequence)
  const results: { instance: WorkoutInstance; prescription: InstancePrescription }[] = []
  for (const instance of instances) {
    const prescriptions = await db.instancePrescriptions.where('instanceId').equals(instance.id).toArray()
    for (const prescription of prescriptions) {
      const exercise = await db.exercises.get(prescription.exerciseId)
      if (exercise?.category === 'run') {
        results.push({ instance, prescription })
        break
      }
    }
  }
  if (results.length === 0) throw new Error(`no run instance found for week ${String(weekNumber)}`)
  return results
}

beforeEach(async () => {
  await resetDatabase()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Progress: running — empty state', () => {
  it('shows an EmptyState when no plan/goal exists yet', async () => {
    // Onboarded, but no plan installed (no seedTestDb call at all) -- the
    // real "fresh install, nothing set up yet" shape.
    await onboard()
    renderApp({ route: '/progress' })
    await screen.findByRole('heading', { level: 1, name: /progress/i })
    await userEvent.click(screen.getByRole('radio', { name: 'Running' }))

    await screen.findByText(/no plan yet/i)
    expect(screen.queryByRole('heading', { level: 3, name: /weekly running volume/i })).toBeNull()
  })
})

describe('Progress: running — weekly volume categories', () => {
  it('shows planned, completed, missed, and dropped distance, each with its own text label, never colour alone', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderRunningProgress()

    const legend = document.querySelector<HTMLElement>('.volume-legend')
    if (!legend) throw new Error('expected a .volume-legend element')
    expect(within(legend).getByText('Planned')).toBeInTheDocument()
    expect(within(legend).getByText('Completed')).toBeInTheDocument()
    expect(within(legend).getByText('Missed')).toBeInTheDocument()
    expect(within(legend).getByText('Dropped')).toBeInTheDocument()
  })

  it('shows completed and planned distance as two explicit values, not a single percentage', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderRunningProgress()

    const note = document.querySelector('.chart-card__note')
    expect(note?.textContent).toMatch(/completed/i)
    expect(note?.textContent).toMatch(/planned/i)
    expect(note?.textContent).not.toMatch(/%/)
  })

  it('categorizes a skipped run session as missed distance and an auto-dropped one as dropped distance', async () => {
    await seedTestDb({ withHistory: true })
    const candidates = await runInstancesForWeek(2) // week 2: untouched by the withHistory fixture
    const [missed, dropped] = candidates
    if (!missed || !dropped || missed.instance.id === dropped.instance.id) {
      throw new Error('expected two distinct week-2 run instances')
    }
    // Force a known prescribed distance on each -- this test is about the
    // status -> category mapping, not about which weeks happen to carry a
    // `distanceM` in the seed plan (most early-week run prescriptions are
    // duration-only; see `prescribedRunDistanceM`'s own doc comment).
    await db.instancePrescriptions.put({ ...missed.prescription, distanceM: 5000 })
    await db.instancePrescriptions.put({ ...dropped.prescription, distanceM: 4000 })
    await db.workoutInstances.put({ ...missed.instance, status: 'skipped' })
    await db.workoutInstances.put({ ...dropped.instance, status: 'autoDropped' })

    await onboard()
    // Advance "today" into week 2 so the chart's window includes it.
    vi.setSystemTime(new Date(2026, 0, 12, 8, 0, 0))
    await renderRunningProgress()

    const table = document.querySelectorAll('.chart-table')[0]
    if (!table) throw new Error('expected a chart-table for weekly volume')
    const rows = within(table as HTMLElement).getAllByRole('row')
    const week2Row = rows.find((row) => within(row).queryByText('2') !== null)
    if (!week2Row) throw new Error('expected a week-2 row in the weekly volume table')
    const cells = within(week2Row).getAllByRole('cell').map((cell) => cell.textContent ?? '')
    const [, , , missedCell, droppedCell] = cells
    expect(missedCell).toBe('5 km')
    expect(droppedCell).toBe('4 km')
  })
})

describe('Progress: running — a week with no runs', () => {
  it('shows the week as a zero row rather than omitting it from the chart', async () => {
    await seedTestDb() // no history at all -- every metric is genuinely zero
    await onboard()
    await renderRunningProgress()

    const details = document.querySelectorAll('.chart-table')[0]
    if (!details) throw new Error('expected a chart-table for weekly volume')
    const rows = within(details as HTMLElement).getAllByRole('row')
    // Header row + at least one data row for week 1, which must still be
    // PRESENT (not omitted) even though nothing has been completed.
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const week1Row = rows.find((row) => within(row).queryByText('1') !== null)
    expect(week1Row).toBeDefined()
    expect(week1Row?.textContent).toMatch(/0 m/)
  })
})

describe('Progress: running — a week prescribed entirely by duration', () => {
  it('shows a non-zero planned figure (in minutes) instead of pretending the plan asked for 0 km', async () => {
    await seedTestDb() // no history -- real seeded week 1: easy run, quality intervals,
    // and the long run are ALL duration-prescribed (30 min / 6x2min / 40 min),
    // never a distanceM. Before this fix, `plannedKm` alone made week 1 read as
    // "0 km planned", which an athlete logging 0 km completed could misread as
    // having already matched the plan.
    await onboard()
    await renderRunningProgress()

    const table = document.querySelectorAll('.chart-table')[0]
    if (!table) throw new Error('expected a chart-table for weekly volume')
    const rows = within(table as HTMLElement).getAllByRole('row')
    const week1Row = rows.find((row) => within(row).queryByText('1') !== null)
    if (!week1Row) throw new Error('expected a week-1 row')
    const cells = within(week1Row).getAllByRole('cell').map((cell) => cell.textContent ?? '')
    const [, plannedCell] = cells

    // Week 1's real prescribed running time: easy run 30 min + long run 40
    // min + quality run 6x2min = 82 min, 0 km.
    expect(plannedCell).toBe('82 min')
    expect(plannedCell).not.toBe('0 km')
    expect(plannedCell).not.toBe('0 m')

    const note = document.querySelector('.chart-card__note')
    expect(note?.textContent).toMatch(/82 min planned/)
    expect(note?.textContent).not.toMatch(/0 km planned/)

    // The note and table were honest, but the CHART plots plannedKm alone, so
    // week 1 draws a zero Planned bar beside a real Completed one and reads as
    // far ahead of plan. The bars cannot be corrected without inventing a pace,
    // so the chart has to say which weeks its Planned bar understates.
    const caveat = document.querySelector('.chart-card__caveat')
    // Singular here: week 1 is the only week in the window at this point.
    expect(caveat?.textContent).toMatch(/^Week 1 prescribes running by time, not distance/)
    expect(caveat?.textContent).toMatch(/table below/)
  })
})

describe('Progress: running — pace, benchmark, durability, milestones, trajectory', () => {
  it('renders run distance over time, pace by type, easy-run trend, benchmark history, longest run, and trajectory evidence', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderRunningProgress()

    await screen.findByRole('heading', { level: 3, name: /weekly running volume/i })
    await screen.findByRole('heading', { level: 3, name: /average pace by run type/i })
    await screen.findByRole('heading', { level: 3, name: /easy-run pace trend/i })
    const durabilityHeading = await screen.findByRole('heading', { level: 3, name: /durability/i })
    const durabilityCard = durabilityHeading.closest('.running-progress__stats')
    if (!durabilityCard) throw new Error('expected a running-progress__stats card')
    expect(within(durabilityCard as HTMLElement).getByText(/longest continuous run/i)).toBeInTheDocument()
    await screen.findByRole('heading', { level: 3, name: /milestones/i })
    await screen.findByRole('heading', { level: 3, name: /trajectory toward race day/i })
    expect(screen.getByText(/1 of 12 milestones met/i)).toBeInTheDocument()
  })
})

describe('Progress: running — milestone targets move with the goal', () => {
  it('changes the displayed 5 km target when the race goal time changes', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderRunningProgress()

    const milestoneList = document.querySelector('.milestone-list')
    if (!milestoneList) throw new Error('expected a .milestone-list element')
    const before = within(milestoneList as HTMLElement).getByText(/Standalone 5 km benchmark/i).closest('.milestone-list__item')
    if (!before) throw new Error('expected a standalone5k milestone row')
    const beforeText = before.textContent ?? ''

    await setRaceGoal({ raceDate: '2026-06-15', targetSeconds: 3600, stretchSeconds: 3500 }, NOW)

    await waitFor(() => {
      const list = document.querySelector('.milestone-list')
      if (!list) throw new Error('expected a .milestone-list element after the goal change')
      const after = within(list as HTMLElement).getByText(/Standalone 5 km benchmark/i).closest('.milestone-list__item')
      expect(after?.textContent).not.toBe(beforeText)
    })
  })
})

describe('Progress: running — legibility and accessibility at 375px', () => {
  it('gives every chart a fixed-height, non-page-widening scroll container and a tabular fallback', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderRunningProgress()

    const scrollers = document.querySelectorAll('.chart-card__scroll')
    expect(scrollers.length).toBeGreaterThan(0)
    for (const scroller of scrollers) {
      expect(getComputedStyle(scroller).overflowX).toBe('auto')
    }

    const tables = document.querySelectorAll('.chart-table')
    expect(tables.length).toBeGreaterThan(0)
    for (const table of tables) {
      expect(table.querySelectorAll('tbody tr').length).toBeGreaterThan(0)
    }
  })
})
