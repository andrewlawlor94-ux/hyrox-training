import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import { setRaceGoal, syncQueue, updateSettings } from '@/data/repositories'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import type { WorkoutInstance, WorkoutTemplate } from '@/data/types'
import { renderApp } from '@/test/renderApp'

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
