import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import type { WorkoutInstance, WorkoutTemplate } from '@/data/types'
import { appendEvent, clearOverride, listEvents, resetRecommendations, setOverride, syncQueue } from '../scheduleRepo'

const NOW = '2026-07-27T10:00:00.000Z'
const PLAN_START = '2026-07-06' // a Monday
const RACE_DATE = '2026-12-01'
const SLOT1_DAY = '2026-07-06' // week 1, slot 1 (offset 0)
const SLOT2_DAY = '2026-07-07' // week 1, slot 2 (offset 1)

async function seedPlan(): Promise<void> {
  await db.plans.add({
    id: 'plan_1', name: 'Test plan', weeksCount: 1, status: 'active', startDate: PLAN_START,
    raceGoalId: 'goal_1', createdAt: NOW,
  })
  await db.raceGoals.add({ id: 'goal_1', raceDate: RACE_DATE, targetSeconds: 0, stretchSeconds: 0, division: '', isActive: true, createdAt: NOW })
  await db.settings.add({
    id: 'app', schemaVersion: 1, activePlanId: 'plan_1', strengthUnit: 'lb', stationUnit: 'lb',
    restSoundEnabled: true, restVibrationEnabled: true, dismissedSubstitutions: [],
  })
  await db.planWeeks.add({ id: 'week_1', planId: 'plan_1', weekNumber: 1, phaseId: 'phase_1', label: 'Week 1', isDeload: false, notes: '' })

  const templates: WorkoutTemplate[] = [
    { id: 'tmpl_1', planId: 'plan_1', planWeekId: 'week_1', sessionSlot: 1, sequenceInWeek: 0, name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: ['lowerBodyStrength'], estMinutes: 60, notes: '' },
    { id: 'tmpl_2', planId: 'plan_1', planWeekId: 'week_1', sessionSlot: 2, sequenceInWeek: 1, name: 'Easy run', kind: 'run', priority: 'essential', recoveryTags: ['easyRun'], estMinutes: 40, notes: '' },
  ]
  await db.workoutTemplates.bulkAdd(templates)

  const instances: WorkoutInstance[] = [
    { id: 'wi_1', planId: 'plan_1', templateId: 'tmpl_1', weekNumber: 1, sessionSlot: 1, plannedDate: SLOT1_DAY, scheduledDate: SLOT1_DAY, sequence: 0, priority: 'essential', recoveryTags: ['lowerBodyStrength'], status: 'upcoming', isManualOverride: false, frozen: false },
    { id: 'wi_2', planId: 'plan_1', templateId: 'tmpl_2', weekNumber: 1, sessionSlot: 2, plannedDate: SLOT2_DAY, scheduledDate: SLOT2_DAY, sequence: 1, priority: 'essential', recoveryTags: ['easyRun'], status: 'upcoming', isManualOverride: false, frozen: false },
  ]
  await db.workoutInstances.bulkAdd(instances)
}

beforeEach(async () => {
  await resetDatabase()
  await seedPlan()
})

describe('scheduleRepo', () => {
  it('appendEvent only ever appends; listEvents returns them in at order', async () => {
    await appendEvent({ at: '2026-07-27T12:00:00.000Z', type: 'MOVE', instanceId: 'tmpl_1', payload: {} })
    await appendEvent({ at: '2026-07-27T10:00:00.000Z', type: 'MOVE', instanceId: 'tmpl_1', payload: {} })
    await appendEvent({ at: '2026-07-27T11:00:00.000Z', type: 'MOVE', instanceId: 'tmpl_1', payload: {} })
    const events = await listEvents()
    expect(events.map((e) => e.at)).toEqual([
      '2026-07-27T10:00:00.000Z', '2026-07-27T11:00:00.000Z', '2026-07-27T12:00:00.000Z',
    ])
  })

  it('no repository function updates or deletes a scheduleEvents row: the count only ever grows', async () => {
    await appendEvent({ at: '2026-07-27T09:00:00.000Z', type: 'MOVE', instanceId: 'tmpl_1', payload: {} })
    await appendEvent({ at: '2026-07-27T09:30:00.000Z', type: 'MOVE', instanceId: 'tmpl_2', payload: {} })
    const countBefore = await db.scheduleEvents.count()

    await resetRecommendations(NOW)
    const countAfterReset = await db.scheduleEvents.count()
    expect(countAfterReset).toBe(countBefore + 1)

    await syncQueue(SLOT1_DAY)
    const countAfterSync = await db.scheduleEvents.count()
    expect(countAfterSync).toBe(countAfterReset)

    await setOverride({ instanceId: 'wi_2', date: SLOT2_DAY, now: NOW })
    await clearOverride('wi_2')
    expect(await db.scheduleEvents.count()).toBe(countAfterSync)
  })

  it('syncQueue persists derived scheduledDate/status onto workoutInstances, writes queueExplanations, and never touches a frozen instance', async () => {
    // Freeze wi_1 as already completed on SLOT2_DAY, occupying that date.
    const frozenSnapshotBefore: WorkoutInstance = {
      ...(await db.workoutInstances.get('wi_1'))!, frozen: true, status: 'completed',
      completedAt: NOW, completedForDate: SLOT2_DAY,
    }
    await db.workoutInstances.put(frozenSnapshotBefore)
    await appendEvent({ at: NOW, type: 'COMPLETE', instanceId: 'tmpl_1', payload: { forDate: SLOT2_DAY } })

    // Pin wi_2 onto the same (now-occupied) date -- the pin will be rejected,
    // producing a genuine adjustmentReason/explanation, not an empty one.
    await setOverride({ instanceId: 'wi_2', date: SLOT2_DAY, now: NOW })

    await syncQueue(SLOT1_DAY)

    const frozenAfter = await db.workoutInstances.get('wi_1')
    expect(frozenAfter).toEqual(frozenSnapshotBefore)

    const wi2 = await db.workoutInstances.get('wi_2')
    expect(wi2?.scheduledDate).not.toBe(SLOT2_DAY)
    expect(wi2?.isManualOverride).toBe(false)
    expect(wi2?.adjustmentReason).toBeTruthy()

    const explanations = await db.queueExplanations.toArray()
    expect(explanations.length).toBeGreaterThan(0)
    expect(explanations.some((e) => e.instanceId === 'wi_2')).toBe(true)
  })

  it('syncQueue run twice with the same today is idempotent', async () => {
    // Force at least one real explanation each run (a rejected pin), so a
    // missing `.clear()` before rewriting `queueExplanations` would show up
    // as row-count growth on the second call, not just as an inert no-op.
    const completed: WorkoutInstance = {
      ...(await db.workoutInstances.get('wi_1'))!, frozen: true, status: 'completed',
      completedAt: NOW, completedForDate: SLOT2_DAY,
    }
    await db.workoutInstances.put(completed)
    await appendEvent({ at: NOW, type: 'COMPLETE', instanceId: 'tmpl_1', payload: { forDate: SLOT2_DAY } })
    await setOverride({ instanceId: 'wi_2', date: SLOT2_DAY, now: NOW })

    await syncQueue(SLOT1_DAY)
    const first = await db.workoutInstances.toArray()
    const explanationsCountFirst = await db.queueExplanations.count()
    expect(explanationsCountFirst).toBeGreaterThan(0)
    await syncQueue(SLOT1_DAY)
    const second = await db.workoutInstances.toArray()
    expect(second).toEqual(first)
    // A missing `.clear()` before rewriting queueExplanations would leave
    // this table's row count growing on every call even though the
    // instances above are unchanged -- assert it directly rather than
    // relying on the instances comparison to notice.
    expect(await db.queueExplanations.count()).toBe(explanationsCountFirst)
  })

  it('setOverride then syncQueue honours the pinned date', async () => {
    const pinnedDate = '2026-07-08'
    await setOverride({ instanceId: 'wi_2', date: pinnedDate, now: NOW })
    await syncQueue(SLOT1_DAY)
    const wi2 = await db.workoutInstances.get('wi_2')
    expect(wi2?.scheduledDate).toBe(pinnedDate)
    expect(wi2?.isManualOverride).toBe(true)
  })

  it('resetRecommendations clears manual overrides (after syncQueue) while preserving all completions', async () => {
    // Freeze wi_1 as completed history.
    const completed: WorkoutInstance = {
      ...(await db.workoutInstances.get('wi_1'))!, frozen: true, status: 'completed',
      completedAt: NOW, completedForDate: SLOT1_DAY,
    }
    await db.workoutInstances.put(completed)
    await appendEvent({ at: NOW, type: 'COMPLETE', instanceId: 'tmpl_1', payload: { forDate: SLOT1_DAY } })

    await setOverride({ instanceId: 'wi_2', date: '2026-07-08', now: NOW })
    await syncQueue(SLOT1_DAY)
    expect((await db.workoutInstances.get('wi_2'))?.isManualOverride).toBe(true)

    await resetRecommendations(NOW)
    await syncQueue(SLOT1_DAY)

    expect((await db.workoutInstances.get('wi_2'))?.isManualOverride).toBe(false)
    // The completion survives untouched.
    expect(await db.workoutInstances.get('wi_1')).toEqual(completed)
  })
})
