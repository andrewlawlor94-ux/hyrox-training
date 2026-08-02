import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import { getActiveGoal, readProfile, updateSettings } from '@/data/repositories'
import type { Plan, WorkoutInstance } from '@/data/types'
import { addDays as addDaysIso } from '@/domain/dates'
import { renderApp } from '@/test/renderApp'
import { seedTestDb } from '@/test/seedTestDb'

const NOW = '2026-01-05T08:00:00.000Z'
// `GoalSettings` reads `today` via `useToday`, which reads the real clock —
// faked here (matching `seedTestDb`'s own fixture date) so the race-date
// warning's "fewer than 24 weeks remain" comparison is against a known
// `today`, not whatever the real wall clock happens to be when the suite runs.
const FAKE_NOW = new Date(2026, 0, 5, 8, 0, 0)

async function onboard(): Promise<void> {
  await updateSettings({ onboardingCompletedAt: NOW })
}

async function renderSettings(): Promise<void> {
  renderApp({ route: '/settings' })
  await screen.findByRole('heading', { level: 1, name: /settings/i })
}

async function activePlan(): Promise<Plan> {
  const settings = await db.settings.get('app')
  const plan = settings ? await db.plans.get(settings.activePlanId) : undefined
  if (!plan) throw new Error('expected an active plan')
  return plan
}

/** The furthest-out non-frozen instance — the one whose date a re-anchor must
 * move, and the one carrying the taper. */
async function lastUpcomingInstance(): Promise<WorkoutInstance> {
  const open = (await db.workoutInstances.toArray())
    .filter((i) => !i.frozen)
    .sort((a, b) => b.weekNumber - a.weekNumber || b.sessionSlot - a.sessionSlot)
  const last = open[0]
  if (!last) throw new Error('expected at least one upcoming instance')
  return last
}

beforeEach(async () => {
  await resetDatabase()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Settings-lite: profile', () => {
  it('edits age, height, weight, body fat, and considerations, and every field persists', async () => {
    await seedTestDb()
    await onboard()
    await renderSettings()

    await userEvent.type(screen.getByLabelText(/^age/i), '34')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText(/height/i), '70')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText(/weight/i), '180')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText(/body fat/i), '15')
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText(/considerations/i), 'occasional shin soreness')
    await userEvent.tab()

    await waitFor(async () => {
      const profile = await readProfile()
      expect(profile?.age).toBe(34)
      expect(profile?.heightIn).toBe(70)
      expect(profile?.weightLb).toBe(180)
      expect(profile?.bodyFatPct).toBe(15)
      expect(profile?.considerations).toBe('occasional shin soreness')
    })
  })
})

describe('Settings-lite: race goal and date', () => {
  it('edits target and stretch time, persists both, and updates the displayed derived milestones', async () => {
    await seedTestDb()
    await onboard()
    await renderSettings()

    // Set the whole value in one change rather than typing it character by
    // character. `commitTimes` correctly refuses to persist a value
    // `parseRaceTime` cannot parse, and a per-keystroke `userEvent.type` under
    // this file's fake timers left the field mid-value ('1:2', '1:20:') when
    // blur fired — so the write was legitimately skipped and the goal stayed at
    // the seeded default. That made the test fail ~2 runs in 3 under parallel
    // load while the app behaviour was correct. This still asserts the real
    // requirement: the parsed value reaches the database on blur.
    const targetInput = await screen.findByLabelText(/target time/i)
    fireEvent.focus(targetInput)
    fireEvent.change(targetInput, { target: { value: '1:20:00' } })
    fireEvent.blur(targetInput)

    await waitFor(async () => {
      const goal = await getActiveGoal()
      expect(goal?.targetSeconds).toBe(4800)
    })
    // The derived standalone-5k/compromised-km preview re-renders from the
    // new target, not a stale one.
    expect(screen.getByText(/Standalone 5 km/i)).toBeInTheDocument()

    const stretchInput = screen.getByLabelText(/stretch time/i)
    fireEvent.focus(stretchInput)
    fireEvent.change(stretchInput, { target: { value: '1:25:00' } })
    fireEvent.blur(stretchInput)

    await waitFor(async () => {
      const goal = await getActiveGoal()
      expect(goal?.stretchSeconds).toBe(5100)
    })
  })

  it('persists a changed race date, and warns when fewer than 24 weeks remain', async () => {
    await seedTestDb()
    await onboard()
    await renderSettings()

    const dateInput = await screen.findByLabelText(/race date/i)
    fireEvent.change(dateInput, { target: { value: '2026-02-01' } })

    await waitFor(async () => {
      const goal = await getActiveGoal()
      expect(goal?.raceDate).toBe('2026-02-01')
    })
    expect(await screen.findByText(/fewer than 24 weeks/i)).toBeInTheDocument()

    // The race moved CLOSER, so the plan is COMPRESSED to fit rather than left
    // at 24 weeks with the surplus stranded past race day. This assertion
    // replaces one that expected the plan to be left alone: that behaviour left
    // sixteen entirely auto-dropped weeks showing as "Done", which the athlete
    // reported as making no sense.
    await waitFor(async () => {
      expect((await activePlan()).weeksCount).toBeLessThan(24)
    })
    // The START still does not move: pulling it backwards would drag plan weeks
    // into the past, where placement finds no candidate day and their sessions
    // are dropped rather than moved. Shortening is what fits a shorter runway.
    expect((await activePlan()).startDate).toBe('2026-01-05')
    expect(await screen.findByText(/core weeks instead of/i)).toBeInTheDocument()
  })

  // Without this, `setRaceGoal` swapped the goal row and appended the event but
  // nothing re-anchored `Plan.startDate` -- every session date is derived from
  // it, so a postponed race left the whole plan, and its taper, landing weeks
  // early no matter how often the queue recomputed.
  it('re-anchors the plan when the race is postponed, moving upcoming dates but never completed ones', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()

    // The fixture is exactly 24 weeks: today 2026-01-05 (Monday) -> race
    // 2026-06-15, so the plan starts today and week 24 is race week.
    expect((await activePlan()).startDate).toBe('2026-01-05')

    const frozenBefore = (await db.workoutInstances.toArray()).filter((i) => i.frozen)
    expect(frozenBefore.length).toBeGreaterThan(0)

    const upcomingBefore = await lastUpcomingInstance()

    await renderSettings()
    const dateInput = await screen.findByLabelText(/race date/i)
    // Three weeks later, same weekday.
    fireEvent.change(dateInput, { target: { value: '2026-07-06' } })

    await waitFor(async () => {
      expect((await activePlan()).startDate).toBe('2026-01-26')
    })

    // Upcoming work re-dates by the same three weeks...
    await waitFor(async () => {
      const after = await db.workoutInstances.get(upcomingBefore.id)
      expect(after?.plannedDate).toBe(addDaysIso(upcomingBefore.plannedDate, 21))
    })

    // ...and every completed session is byte-identical, dates included.
    const frozenAfter = await Promise.all(frozenBefore.map((i) => db.workoutInstances.get(i.id)))
    expect(frozenAfter).toEqual(frozenBefore)

    expect(await screen.findByText(/shifts 3 weeks/i)).toBeInTheDocument()
  })
})

describe('Settings-lite: units', () => {
  it('edits strength and station units, and both persist', async () => {
    await seedTestDb()
    await onboard()
    await renderSettings()

    const strengthGroup = screen.getByRole('group', { name: /strength unit/i })
    await userEvent.click(within(strengthGroup).getByRole('radio', { name: 'kg' }))
    await waitFor(async () => {
      const settings = await db.settings.get('app')
      expect(settings?.strengthUnit).toBe('kg')
    })

    const stationGroup = screen.getByRole('group', { name: /station unit/i })
    await userEvent.click(within(stationGroup).getByRole('radio', { name: 'lb' }))
    await waitFor(async () => {
      const settings = await db.settings.get('app')
      expect(settings?.stationUnit).toBe('lb')
    })
  })
})

describe('Settings-lite: rest-timer defaults', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
  })

  it('shows sound and vibration off by default, and toggling either persists', async () => {
    await seedTestDb()
    await onboard()
    Object.defineProperty(navigator, 'vibrate', { value: (): boolean => true, configurable: true })
    await renderSettings()

    const soundGroup = screen.getByRole('group', { name: /rest sound/i })
    expect(within(soundGroup).getByRole('radio', { name: 'Off' })).toBeChecked()
    const vibrationGroup = screen.getByRole('group', { name: /rest vibration/i })
    expect(within(vibrationGroup).getByRole('radio', { name: 'Off' })).toBeChecked()

    await userEvent.click(within(soundGroup).getByRole('radio', { name: 'On' }))
    await waitFor(async () => {
      const settings = await db.settings.get('app')
      expect(settings?.restSoundEnabled).toBe(true)
    })

    await userEvent.click(within(vibrationGroup).getByRole('radio', { name: 'On' }))
    await waitFor(async () => {
      const settings = await db.settings.get('app')
      expect(settings?.restVibrationEnabled).toBe(true)
    })
  })

  it('disables the vibration toggle with an explanatory note when navigator.vibrate is absent', async () => {
    await seedTestDb()
    await onboard()
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
    await renderSettings()

    const vibrationGroup = screen.getByRole('group', { name: /rest vibration/i })
    expect(within(vibrationGroup).getByRole('radio', { name: 'On' })).toBeDisabled()
    expect(within(vibrationGroup).getByRole('radio', { name: 'Off' })).toBeDisabled()
    expect(screen.getByText(/doesn.t support vibration/i)).toBeInTheDocument()
  })
})
