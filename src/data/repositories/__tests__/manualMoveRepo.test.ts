import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import type { WorkoutInstance, WorkoutTemplate } from '@/data/types'
import { moveWorkoutManually, previewMoveConflicts } from '../manualMoveRepo'
import { resetRecommendations, syncQueue } from '../scheduleRepo'

const NOW = '2026-07-27T10:00:00.000Z'
const LATER = '2026-07-27T11:00:00.000Z'
const PLAN_ID = 'plan_1'
const PLAN_START = '2026-07-06' // Monday
const RACE_DATE = '2026-12-01'

/** Week 1: a hard lower-body strength day (Monday) and a hard run (Tuesday) —
 * adjacent hard days conflict per the recovery matrix — plus an easy day
 * (Wednesday) with room to move things around. */
async function seedFixture(): Promise<void> {
  await db.plans.add({ id: PLAN_ID, name: 'Test plan', weeksCount: 1, status: 'active', startDate: PLAN_START, raceGoalId: 'goal_1', createdAt: NOW })
  await db.raceGoals.add({ id: 'goal_1', raceDate: RACE_DATE, targetSeconds: 0, stretchSeconds: 0, division: '', isActive: true, createdAt: NOW })
  await db.settings.add({
    id: 'app', schemaVersion: 1, activePlanId: PLAN_ID, strengthUnit: 'lb', stationUnit: 'lb',
    restSoundEnabled: true, restVibrationEnabled: true, dismissedSubstitutions: [],
  })
  await db.planWeeks.add({ id: 'week_1', planId: PLAN_ID, weekNumber: 1, phaseId: 'phase_1', label: 'Week 1', isDeload: false, notes: '' })

  const templates: WorkoutTemplate[] = [
    { id: 'tmpl_str', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 1, sequenceInWeek: 0, name: 'Lower body strength', kind: 'strength', priority: 'essential', recoveryTags: ['lowerBodyStrength'], estMinutes: 60, notes: '' },
    { id: 'tmpl_hardrun', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 2, sequenceInWeek: 1, name: 'Hard run', kind: 'run', priority: 'essential', recoveryTags: ['hardRun'], estMinutes: 45, notes: '' },
    { id: 'tmpl_easy', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 3, sequenceInWeek: 2, name: 'Easy run', kind: 'run', priority: 'important', recoveryTags: ['easyRun'], estMinutes: 30, notes: '' },
    { id: 'tmpl_hardrun2', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 5, sequenceInWeek: 3, name: 'Hard run 2', kind: 'run', priority: 'essential', recoveryTags: ['hardRun'], estMinutes: 45, notes: '' },
  ]
  await db.workoutTemplates.bulkAdd(templates)

  const instances: WorkoutInstance[] = [
    { id: 'wi_str', planId: PLAN_ID, templateId: 'tmpl_str', weekNumber: 1, sessionSlot: 1, plannedDate: '2026-07-06', scheduledDate: '2026-07-06', sequence: 0, priority: 'essential', recoveryTags: ['lowerBodyStrength'], status: 'upcoming', isManualOverride: false, frozen: false },
    { id: 'wi_hardrun', planId: PLAN_ID, templateId: 'tmpl_hardrun', weekNumber: 1, sessionSlot: 2, plannedDate: '2026-07-07', scheduledDate: '2026-07-07', sequence: 1, priority: 'essential', recoveryTags: ['hardRun'], status: 'upcoming', isManualOverride: false, frozen: false },
    { id: 'wi_easy', planId: PLAN_ID, templateId: 'tmpl_easy', weekNumber: 1, sessionSlot: 3, plannedDate: '2026-07-08', scheduledDate: '2026-07-08', sequence: 2, priority: 'important', recoveryTags: ['easyRun'], status: 'upcoming', isManualOverride: false, frozen: false },
    // Friday (07-10): a second hard run, so moving strength to Thursday
    // (07-09, immediately before it) is a genuinely NEW date that recreates
    // the one-directional "lowerBodyStrength -> hardRun" hard conflict,
    // rather than the move being a no-op back onto strength's own current day.
    { id: 'wi_hardrun2', planId: PLAN_ID, templateId: 'tmpl_hardrun2', weekNumber: 1, sessionSlot: 5, plannedDate: '2026-07-10', scheduledDate: '2026-07-10', sequence: 3, priority: 'essential', recoveryTags: ['hardRun'], status: 'upcoming', isManualOverride: false, frozen: false },
  ]
  await db.workoutInstances.bulkAdd(instances)
}

beforeEach(async () => {
  await resetDatabase()
  await seedFixture()
})

describe('previewMoveConflicts', () => {
  it('names the specific hard recovery conflict when moving strength to the day before a hard run', async () => {
    const conflicts = await previewMoveConflicts({ instanceId: 'wi_str', date: '2026-07-09' })
    expect(conflicts.length).toBeGreaterThan(0)
    expect(conflicts.some((c) => /recovery/i.test(c))).toBe(true)
  })

  it('returns no conflicts for a genuinely clear day', async () => {
    const conflicts = await previewMoveConflicts({ instanceId: 'wi_easy', date: '2026-07-13' })
    expect(conflicts).toEqual([])
  })
})

describe('moveWorkoutManually', () => {
  it('performs the move, records a MOVE event, and the pinned date survives a later unrelated recomputation', async () => {
    await moveWorkoutManually({ instanceId: 'wi_str', date: '2026-07-09', now: NOW, today: PLAN_START })

    const moved = await db.workoutInstances.get('wi_str')
    expect(moved?.scheduledDate).toBe('2026-07-09')
    expect(moved?.isManualOverride).toBe(true)

    const moveEvents = await db.scheduleEvents.where('type').equals('MOVE').toArray()
    expect(moveEvents.length).toBeGreaterThan(0)

    // An unrelated recompute (different `today`) must not un-pin it.
    await syncQueue('2026-07-07')
    const stillMoved = await db.workoutInstances.get('wi_str')
    expect(stillMoved?.scheduledDate).toBe('2026-07-09')
    expect(stillMoved?.isManualOverride).toBe(true)
  })

  it('throws on a frozen instance', async () => {
    await db.workoutInstances.put({
      ...(await db.workoutInstances.get('wi_str'))!, frozen: true, status: 'completed', completedAt: NOW, completedForDate: '2026-07-06',
    })
    await expect(moveWorkoutManually({ instanceId: 'wi_str', date: '2026-07-09', now: NOW, today: PLAN_START })).rejects.toThrow(/immutable/i)
  })
})

describe('reset schedule recommendations preserves history', () => {
  it('clears a manual move while every completed instance and log row survives', async () => {
    await moveWorkoutManually({ instanceId: 'wi_easy', date: '2026-07-11', now: NOW, today: PLAN_START })
    expect((await db.workoutInstances.get('wi_easy'))?.isManualOverride).toBe(true)

    // Complete the strength day, with a logged set, before resetting.
    await db.workoutInstances.put({
      ...(await db.workoutInstances.get('wi_str'))!, frozen: true, status: 'completed', completedAt: NOW, completedForDate: '2026-07-06',
    })
    await db.strengthSets.add({
      id: 'set_1', instanceId: 'wi_str', instancePrescriptionId: 'ip_1', exerciseId: 'ex_squat', setIndex: 0,
      weight: 175, unit: 'lb', reps: 5, isCompleted: true, completedAt: NOW, isWarmup: false,
    })
    const completedBefore = await db.workoutInstances.get('wi_str')
    const setBefore = await db.strengthSets.get('set_1')

    await resetRecommendations(LATER)
    await syncQueue(PLAN_START)

    expect((await db.workoutInstances.get('wi_easy'))?.isManualOverride).toBe(false)
    expect(await db.workoutInstances.get('wi_str')).toEqual(completedBefore)
    expect(await db.strengthSets.get('set_1')).toEqual(setBefore)
  })
})
