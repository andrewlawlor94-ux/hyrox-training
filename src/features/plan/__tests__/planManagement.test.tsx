import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import { reanchorActivePlanToRaceDate, setRaceGoal, syncQueue, updateSettings } from '@/data/repositories'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import type { WorkoutInstance, WorkoutTemplate } from '@/data/types'
import { renderApp } from '@/test/renderApp'
import { seedTestDb } from '@/test/seedTestDb'

const NOW = '2026-08-24T09:00:00.000Z'
const FAKE_NOW = new Date(2026, 7, 24, 9, 0, 0)
const PLAN_ID = 'plan_manage_test'

async function seedFixture(): Promise<void> {
  await db.plans.add({ id: PLAN_ID, name: 'Test plan', weeksCount: 1, status: 'active', startDate: '2026-08-17', raceGoalId: 'goal_1', createdAt: NOW })
  await db.raceGoals.add({ id: 'goal_1', raceDate: '2026-12-01', targetSeconds: 5700, stretchSeconds: 6000, division: '', isActive: true, createdAt: NOW })
  await db.planPhases.add({ id: 'phase_1', planId: PLAN_ID, name: 'Base', weekStart: 1, weekEnd: 1, focus: '' })
  await db.planWeeks.add({ id: 'week_1', planId: PLAN_ID, weekNumber: 1, phaseId: 'phase_1', label: 'Week 1', isDeload: false, notes: '' })

  const template: WorkoutTemplate = {
    id: 'tmpl_1', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 1, sequenceInWeek: 0,
    name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 45, notes: '',
  }
  await db.workoutTemplates.add(template)

  const instance: WorkoutInstance = {
    id: 'wi_1', planId: PLAN_ID, templateId: 'tmpl_1', weekNumber: 1, sessionSlot: 1, plannedDate: '2026-08-17',
    scheduledDate: '2026-08-17', sequence: 0, priority: 'essential', recoveryTags: [], status: 'completed',
    isManualOverride: false, frozen: true, completedAt: NOW, completedForDate: '2026-08-17',
  }
  await db.workoutInstances.add(instance)
}

async function setup(): Promise<void> {
  await resetDatabase()
  await seedIfEmpty(db, NOW)
  await updateSettings({ onboardingCompletedAt: NOW, activePlanId: PLAN_ID })
  await seedFixture()
}

beforeEach(async () => {
  await setup()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

/** The id `settings.activePlanId` currently points at. `seedTestDb` installs its
 * own plan and makes it active, so this must be read rather than assumed to be
 * this file's `PLAN_ID` fixture. */
async function currentActivePlanId(): Promise<string> {
  const settings = await db.settings.get('app')
  if (!settings) throw new Error('no settings row')
  return settings.activePlanId
}

async function openPlanManager(): Promise<HTMLElement> {
  renderApp({ route: '/plan' })
  await screen.findByRole('heading', { name: 'Plan', level: 1 })
  await userEvent.click(await screen.findByRole('button', { name: 'Manage plans' }))
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByText('Test plan')
  return dialog
}

describe('plan-level operations', () => {
  it('duplicates a plan', async () => {
    const dialog = await openPlanManager()
    const row = within(dialog).getByText('Test plan').closest('li')
    if (!row) throw new Error('expected a plan row')
    await userEvent.click(within(row).getByRole('button', { name: 'Duplicate' }))
    await waitFor(async () => {
      const plans = await db.plans.toArray()
      expect(plans.some((p) => p.sourcePlanId === PLAN_ID)).toBe(true)
    })
  })

  it('archives the active plan and makes an archived plan active again ("restore")', async () => {
    const dialog = await openPlanManager()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))
    await waitFor(async () => {
      expect((await db.plans.get(PLAN_ID))?.status).toBe('archived')
    })

    const makeActiveButton = await within(dialog).findByRole('button', { name: 'Make active' })
    await userEvent.click(makeActiveButton)
    await waitFor(async () => {
      expect((await db.plans.get(PLAN_ID))?.status).toBe('active')
      expect((await db.settings.get('app'))?.activePlanId).toBe(PLAN_ID)
    })
  })

  it('changes the plan duration (core weeks) while preserving completed history', async () => {
    const frozenBefore = await db.workoutInstances.get('wi_1')
    const dialog = await openPlanManager()

    const durationInput = within(dialog).getByLabelText('Core weeks')
    await userEvent.clear(durationInput)
    await userEvent.type(durationInput, '2')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change duration' }))

    await waitFor(async () => {
      const plan = await db.plans.get(PLAN_ID)
      expect(plan?.weeksCount).toBe(2)
    })
    expect(await db.workoutInstances.get('wi_1')).toEqual(frozenBefore)
  })

  // "Create new plan from scratch" was wired but had no test and no manual
  // verification (flagged in the Task 27 report). It archives the current plan
  // and installs a fresh one, which is exactly the shape of operation that
  // could quietly take the athlete's logged training with it.
  it('creates a new plan from scratch, archiving the old one without touching its completed history', async () => {
    const frozenBefore = await db.workoutInstances.get('wi_1')
    expect(frozenBefore?.frozen).toBe(true)
    const dialog = await openPlanManager()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create new plan from scratch' }))

    await waitFor(async () => {
      const plans = await db.plans.toArray()
      const active = plans.filter((p) => p.status === 'active')
      expect(active).toHaveLength(1)
      expect(active[0]?.id).not.toBe(PLAN_ID)
    })

    // The previous plan is ARCHIVED, never deleted — so this is recoverable via
    // "Make active" rather than a one-way door.
    expect((await db.plans.get(PLAN_ID))?.status).toBe('archived')
    // And its completed session is byte-identical: the old plan's history is
    // not re-dated, re-parented, or discarded by installing a new plan.
    expect(await db.workoutInstances.get('wi_1')).toEqual(frozenBefore)
    // Settings points at the new plan, so the app is not left referencing an
    // archived one.
    const activePlanId = (await db.settings.get('app'))?.activePlanId
    expect(activePlanId).toBeDefined()
    expect((await db.plans.get(activePlanId ?? ''))?.status).toBe('active')
  })

  it('resets automated schedule recommendations, preserving completed history', async () => {
    const dialog = await openPlanManager()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset schedule recommendations' }))
    const frozenBefore = await db.workoutInstances.get('wi_1')
    await waitFor(async () => {
      expect(await db.workoutInstances.get('wi_1')).toEqual(frozenBefore)
    })
  })
})

describe('race date and target time (reusing setRaceGoal -- not duplicated here)', () => {
  it('changing the race date recalculates the schedule but never re-dates a completed instance\'s completedForDate', async () => {
    const before = await db.workoutInstances.get('wi_1')

    await setRaceGoal({ raceDate: '2026-11-01', targetSeconds: 5700, stretchSeconds: 6000 }, NOW)
    await syncQueue('2026-08-24')

    const after = await db.workoutInstances.get('wi_1')
    expect(after?.completedForDate).toBe(before?.completedForDate)
    expect(after).toEqual(before)
  })
})

/**
 * The athlete's report: "If I go into plan section, all week 4 onward is marked
 * done and week 1-3 are upcoming. The Done weeks have all exercises marked
 * dropped. The race date is 8 weeks out so none of this makes sense." Plus: "if
 * I go to manage plans it has core weeks at 24 despite race day being earlier."
 *
 * Both came from the same decision: re-anchoring only ever shifted the plan
 * START and deliberately refused to shorten the plan. So a 24-week plan whose
 * race moved to 8 weeks out kept all 24 weeks, and weeks 9-24 fell past race day
 * and were auto-dropped — which the Plan tab then rendered as "Done".
 */
describe('moving the race date closer re-fits the plan instead of stranding weeks past race day', () => {
  it('compresses the plan, leaves nothing dropped, and reports the real core-week count', async () => {
    await seedTestDb() // today 2026-01-05, race 2026-06-15 => 24 core weeks
    const planId = await currentActivePlanId()
    expect((await db.plans.get(planId))?.weeksCount).toBe(24)

    // Race pulled in to 2026-03-02. That is eight weeks LATER than the plan's
    // 2026-01-05 start, which makes it the NINTH plan week (week 1 is the start
    // week) — so a correctly re-fitted plan is nine weeks long, not eight.
    await setRaceGoal({ raceDate: '2026-03-02', targetSeconds: 5700, stretchSeconds: 5400 }, NOW)
    const decision = await reanchorActivePlanToRaceDate({ today: '2026-01-05' })
    expect(decision?.outcome).toBe('compressed')

    // The plan is now actually eight weeks long, not twenty-four.
    const plan = await db.plans.get(planId)
    expect(plan?.weeksCount).toBe(9)

    // Nothing is stranded past race day, and no WEEK is wholly dropped. A few
    // individual optional sessions still drop for recovery reasons — that is
    // normal scheduling, and asserting zero drops would be asserting the wrong
    // thing. What the old behaviour produced was sixteen ENTIRELY dropped weeks.
    const instances = await db.workoutInstances.where('planId').equals(planId).toArray()
    expect(instances.length).toBeGreaterThan(0)
    expect(Math.max(...instances.map((i) => i.weekNumber))).toBeLessThanOrEqual(9)

    const byWeek = new Map<number, string[]>()
    for (const instance of instances) {
      byWeek.set(instance.weekNumber, [...(byWeek.get(instance.weekNumber) ?? []), instance.status])
    }
    const whollyDropped = [...byWeek.entries()]
      .filter(([, statuses]) => statuses.every((status) => status === 'autoDropped'))
      .map(([week]) => week)
    expect(whollyDropped, 'no week should consist entirely of dropped sessions').toEqual([])

    // Nothing scheduled after race day.
    const afterRace = instances.filter((i) => i.scheduledDate !== null && i.scheduledDate > '2026-03-08')
    expect(afterRace.map((i) => i.scheduledDate)).toEqual([])
  })

  it('shows the plan\'s real core-week count in Manage plans, not a hard-coded 24', async () => {
    await seedTestDb()
    await setRaceGoal({ raceDate: '2026-03-02', targetSeconds: 5700, stretchSeconds: 5400 }, NOW)
    await reanchorActivePlanToRaceDate({ today: '2026-01-05' })

    renderApp({ route: '/plan' })
    await screen.findByRole('heading', { name: 'Plan', level: 1 })
    await userEvent.click(await screen.findByRole('button', { name: 'Manage plans' }))
    const dialog = await screen.findByRole('dialog')
    const durationInput = within(dialog).getByLabelText<HTMLInputElement>('Core weeks')
    await waitFor(() => { expect(durationInput.value).toBe('9') })
    // Typing over it is still allowed — it is an override, not a read-only field.
    expect(durationInput).not.toBeDisabled()
  })

  it('a week whose sessions were all dropped reads as "Not needed", never "Done"', async () => {
    await seedTestDb()
    // Drop every session in week 2 directly, so the week is settled but nothing
    // in it was ever attended.
    const week2 = await db.workoutInstances.where({ planId: await currentActivePlanId(), weekNumber: 2 }).toArray()
    expect(week2.length).toBeGreaterThan(0)
    for (const instance of week2) {
      await db.workoutInstances.put({ ...instance, status: 'autoDropped', droppedAt: NOW })
    }

    renderApp({ route: '/plan' })
    await screen.findByRole('heading', { name: 'Plan', level: 1 })
    // Scoped to the week LIST rows: "Week 2" also appears in phase/label text.
    await waitFor(() => { expect(document.querySelectorAll('.week-list__row').length).toBeGreaterThan(1) })
    const week2Row = [...document.querySelectorAll('.week-list__row')]
      .find((row) => row.querySelector('.week-list__number')?.textContent === 'Week 2')
    expect(week2Row, 'expected a Week 2 row in the week list').toBeDefined()
    expect(week2Row?.textContent).toMatch(/Not needed/)
    expect(week2Row?.textContent).not.toMatch(/Done/)
  })
})
