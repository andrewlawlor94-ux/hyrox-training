import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import { syncQueue, updateSettings } from '@/data/repositories'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import type { WorkoutInstance, WorkoutTemplate } from '@/data/types'
import { renderApp } from '@/test/renderApp'

const NOW = '2026-08-24T09:00:00.000Z'
const FAKE_NOW = new Date(2026, 7, 24, 9, 0, 0)
const PLAN_ID = 'plan_move_test'
const EXERCISE_ID = 'ex_back_squat'

/** Week 1: strength (Monday 08-17), easy run (Tuesday 08-18), a second hard
 * run later in the week (Friday 08-21) -- moving strength to the day right
 * before that hard run (Thursday 08-20) recreates the one-directional
 * "lowerBodyStrength -> hardRun" hard conflict at a genuinely new date. */
async function seedFixture(): Promise<void> {
  await db.plans.add({ id: PLAN_ID, name: 'Test plan', weeksCount: 1, status: 'active', startDate: '2026-08-17', raceGoalId: 'goal_1', createdAt: NOW })
  await db.raceGoals.add({ id: 'goal_1', raceDate: '2026-12-01', targetSeconds: 5700, stretchSeconds: 6000, division: '', isActive: true, createdAt: NOW })
  await db.planPhases.add({ id: 'phase_1', planId: PLAN_ID, name: 'Base', weekStart: 1, weekEnd: 1, focus: '' })
  await db.planWeeks.add({ id: 'week_1', planId: PLAN_ID, weekNumber: 1, phaseId: 'phase_1', label: 'Week 1', isDeload: false, notes: '' })

  const templates: WorkoutTemplate[] = [
    { id: 'tmpl_str', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 1, sequenceInWeek: 0, name: 'Lower body strength', kind: 'strength', priority: 'essential', recoveryTags: ['lowerBodyStrength'], estMinutes: 60, notes: '' },
    { id: 'tmpl_easy', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 2, sequenceInWeek: 1, name: 'Easy run', kind: 'run', priority: 'important', recoveryTags: ['easyRun'], estMinutes: 30, notes: '' },
    { id: 'tmpl_hardrun2', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 5, sequenceInWeek: 2, name: 'Hard run', kind: 'run', priority: 'essential', recoveryTags: ['hardRun'], estMinutes: 45, notes: '' },
  ]
  await db.workoutTemplates.bulkAdd(templates)

  const instances: WorkoutInstance[] = [
    { id: 'wi_str', planId: PLAN_ID, templateId: 'tmpl_str', weekNumber: 1, sessionSlot: 1, plannedDate: '2026-08-17', scheduledDate: '2026-08-17', sequence: 0, priority: 'essential', recoveryTags: ['lowerBodyStrength'], status: 'upcoming', isManualOverride: false, frozen: false },
    { id: 'wi_easy', planId: PLAN_ID, templateId: 'tmpl_easy', weekNumber: 1, sessionSlot: 2, plannedDate: '2026-08-18', scheduledDate: '2026-08-18', sequence: 1, priority: 'important', recoveryTags: ['easyRun'], status: 'upcoming', isManualOverride: false, frozen: false },
    { id: 'wi_hardrun2', planId: PLAN_ID, templateId: 'tmpl_hardrun2', weekNumber: 1, sessionSlot: 5, plannedDate: '2026-08-21', scheduledDate: '2026-08-21', sequence: 2, priority: 'essential', recoveryTags: ['hardRun'], status: 'upcoming', isManualOverride: false, frozen: false },
  ]
  await db.workoutInstances.bulkAdd(instances)
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

async function openStrengthEditor(): Promise<HTMLElement> {
  renderApp({ route: '/plan' })
  await screen.findByRole('heading', { name: 'Plan', level: 1 })
  await userEvent.click(await screen.findByText(/Week 1/))
  const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
  await userEvent.click(editButtons[0]!) // Lower body strength
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByLabelText('Name')
  return dialog
}

describe('manual move + conflict warning', () => {
  it('names the specific conflict and lets the athlete Proceed anyway', async () => {
    const dialog = await openStrengthEditor()
    const dateInput = within(dialog).getByLabelText('Move to')
    await userEvent.type(dateInput, '2026-08-20')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }))

    let conflictDialog: HTMLElement | undefined
    await waitFor(() => {
      conflictDialog = screen.getAllByRole('dialog').find((d) => within(d).queryAllByText(/conflict/i).length > 0)
      expect(conflictDialog).toBeDefined()
    })
    expect(conflictDialog).toBeDefined()
    expect(within(conflictDialog!).getAllByRole('alert').length).toBeGreaterThan(0)
    expect(within(conflictDialog!).getAllByText(/recovery/i).length).toBeGreaterThan(0)
    expect(within(conflictDialog!).getByText(/too closely for full recovery/i)).toBeInTheDocument()

    await userEvent.click(within(conflictDialog!).getByRole('button', { name: 'Proceed anyway' }))

    await waitFor(async () => {
      const instance = await db.workoutInstances.get('wi_str')
      expect(instance?.scheduledDate).toBe('2026-08-20')
      expect(instance?.isManualOverride).toBe(true)
    })
  })

  it('Pick another day cancels the move -- nothing is written', async () => {
    const dialog = await openStrengthEditor()
    const dateInput = within(dialog).getByLabelText('Move to')
    await userEvent.type(dateInput, '2026-08-20')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }))

    let conflictDialog: HTMLElement | undefined
    await waitFor(() => {
      conflictDialog = screen.getAllByRole('dialog').find((d) => within(d).queryAllByText(/conflict/i).length > 0)
      expect(conflictDialog).toBeDefined()
    })
    await userEvent.click(within(conflictDialog!).getByRole('button', { name: 'Pick another day' }))

    const instance = await db.workoutInstances.get('wi_str')
    expect(instance?.scheduledDate).toBe('2026-08-17')
    expect(instance?.isManualOverride).toBe(false)
  })

  it('a pinned move survives a later unrelated recomputation, and "Reset schedule recommendations" clears it while completed history survives', async () => {
    const dialog = await openStrengthEditor()
    const dateInput = within(dialog).getByLabelText('Move to')
    await userEvent.type(dateInput, '2026-08-22') // a clear day, no conflict
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }))

    await waitFor(async () => {
      expect((await db.workoutInstances.get('wi_str'))?.scheduledDate).toBe('2026-08-22')
    })

    // A later, wholly unrelated recomputation must not un-pin it.
    await syncQueue('2026-08-19')
    expect((await db.workoutInstances.get('wi_str'))?.scheduledDate).toBe('2026-08-22')
    expect((await db.workoutInstances.get('wi_str'))?.isManualOverride).toBe(true)

    // Close the WorkoutEditor sheet before opening the plan manager sheet,
    // so only one dialog is on screen at a time.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })

    // Freeze a completion elsewhere, with a logged set, before resetting.
    await db.workoutInstances.put({
      ...(await db.workoutInstances.get('wi_easy'))!, frozen: true, status: 'completed', completedAt: NOW, completedForDate: '2026-08-18',
    })
    await db.strengthSets.add({
      id: 'set_1', instanceId: 'wi_easy', instancePrescriptionId: 'ip_1', exerciseId: EXERCISE_ID,
      setIndex: 0, weight: 100, unit: 'lb', reps: 5, isCompleted: true, completedAt: NOW, isWarmup: false,
    })
    const completedBefore = await db.workoutInstances.get('wi_easy')
    const setBefore = await db.strengthSets.get('set_1')

    // Advance the (faked) clock: the RESET_RECOMMENDATIONS event must sort
    // strictly AFTER the earlier MOVE event for `effectiveEvents` to discard
    // it -- two events at the identical instant would fall back to an `id`
    // tiebreak, making the outcome nondeterministic (this is exactly why
    // `manualMoveRepo.test.ts`'s repo-level test uses a distinct `LATER`
    // constant for the same reset).
    vi.setSystemTime(new Date(FAKE_NOW.getTime() + 60_000))

    await userEvent.click(await screen.findByRole('button', { name: 'Manage plans' }))
    const managerDialog = await screen.findByRole('dialog')
    await userEvent.click(within(managerDialog).getByRole('button', { name: 'Reset schedule recommendations' }))

    await waitFor(async () => {
      expect((await db.workoutInstances.get('wi_str'))?.isManualOverride).toBe(false)
    })
    expect(await db.workoutInstances.get('wi_easy')).toEqual(completedBefore)
    expect(await db.strengthSets.get('set_1')).toEqual(setBefore)
  })
})
