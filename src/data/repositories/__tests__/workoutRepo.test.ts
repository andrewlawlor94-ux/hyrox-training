import { beforeEach, describe, expect, it } from 'vitest'
import { db, openDb, resetDatabase } from '@/data/db'
import type { WorkoutInstance } from '@/data/types'
import { HistoryImmutableError } from '@/data/errors'
import {
  addSet, completeSet, completeWorkout, getInstanceWithPrescriptions, removeSet, startWorkout, upsertSet,
} from '../workoutRepo'
import { listEvents } from '../scheduleRepo'

const NOW = '2026-07-27T10:00:00.000Z'

function makeInstance(overrides: Partial<WorkoutInstance> = {}): WorkoutInstance {
  return {
    id: 'wi_1', planId: 'plan_1', templateId: 'tmpl_1', weekNumber: 1, sessionSlot: 1,
    plannedDate: '2026-07-27', scheduledDate: '2026-07-27', sequence: 0, priority: 'essential',
    recoveryTags: [], status: 'upcoming', isManualOverride: false, frozen: false,
    ...overrides,
  }
}

beforeEach(async () => { await resetDatabase() })

describe('workoutRepo', () => {
  it('startWorkout sets status: inProgress and startedAt', async () => {
    await db.workoutInstances.add(makeInstance())
    await startWorkout('wi_1', NOW)
    const instance = await db.workoutInstances.get('wi_1')
    expect(instance?.status).toBe('inProgress')
    expect(instance?.startedAt).toBe(NOW)
  })

  it('addSet appends with the next setIndex and prefills nothing', async () => {
    await db.workoutInstances.add(makeInstance())
    await db.instancePrescriptions.add({ id: 'ip_1', instanceId: 'wi_1', exerciseId: 'ex_1', order: 0, restSec: 120, templateId: 'tmpl_1' })

    const first = await addSet({ instanceId: 'wi_1', instancePrescriptionId: 'ip_1', now: NOW })
    expect(first.setIndex).toBe(0)
    expect(first.weight).toBeUndefined()
    expect(first.reps).toBeUndefined()
    expect(first.isCompleted).toBe(false)

    const second = await addSet({ instanceId: 'wi_1', instancePrescriptionId: 'ip_1', now: NOW })
    expect(second.setIndex).toBe(1)
  })

  it('completeSet sets isCompleted and completedAt', async () => {
    await db.workoutInstances.add(makeInstance())
    await db.strengthSets.add({
      id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: 'ex_1', setIndex: 0,
      isCompleted: false, isWarmup: false,
    })
    await completeSet('set_1', NOW)
    const set = await db.strengthSets.get('set_1')
    expect(set?.isCompleted).toBe(true)
    expect(set?.completedAt).toBe(NOW)
  })

  it('completeSet called twice yields one completion and does not throw', async () => {
    await db.workoutInstances.add(makeInstance())
    await db.strengthSets.add({
      id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: 'ex_1', setIndex: 0,
      isCompleted: false, isWarmup: false,
    })
    await completeSet('set_1', NOW)
    const laterNow = '2026-07-27T10:05:00.000Z'
    await expect(completeSet('set_1', laterNow)).resolves.toBeUndefined()
    const set = await db.strengthSets.get('set_1')
    // Second call must be a true no-op: completedAt stays the FIRST value,
    // not the later one -- this is what distinguishes "idempotent" from
    // "happens to write the same isCompleted flag twice".
    expect(set?.completedAt).toBe(NOW)
    expect(await db.strengthSets.count()).toBe(1)
  })

  it('completeSet on a set belonging to a now-frozen instance is still a no-op, not a throw', async () => {
    await db.workoutInstances.add(makeInstance())
    await db.strengthSets.add({
      id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: 'ex_1', setIndex: 0,
      isCompleted: true, completedAt: NOW, isWarmup: false,
    })
    await db.workoutInstances.put({ ...(await db.workoutInstances.get('wi_1'))!, frozen: true, status: 'completed' })
    await expect(completeSet('set_1', '2026-07-27T11:00:00.000Z')).resolves.toBeUndefined()
    expect((await db.strengthSets.get('set_1'))?.completedAt).toBe(NOW)
  })

  it('addSet on a frozen instance throws HistoryImmutableError', async () => {
    await db.workoutInstances.add(makeInstance({ frozen: true, status: 'completed' }))
    await db.instancePrescriptions.add({ id: 'ip_1', instanceId: 'wi_1', exerciseId: 'ex_1', order: 0, restSec: 120, templateId: 'tmpl_1' })
    await expect(addSet({ instanceId: 'wi_1', instancePrescriptionId: 'ip_1', now: NOW })).rejects.toBeInstanceOf(HistoryImmutableError)
  })

  it('removeSet on a set belonging to a frozen instance throws HistoryImmutableError', async () => {
    await db.workoutInstances.add(makeInstance({ frozen: true, status: 'completed' }))
    await db.strengthSets.add({
      id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: 'ex_1', setIndex: 0, isCompleted: true, isWarmup: false,
    })
    await expect(removeSet('set_1')).rejects.toBeInstanceOf(HistoryImmutableError)
    expect(await db.strengthSets.get('set_1')).toBeDefined()
  })

  it('upsertSet on an instance whose frozen is true throws HistoryImmutableError', async () => {
    await db.workoutInstances.add(makeInstance({ frozen: true, status: 'completed' }))
    const set = {
      id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: 'ex_1', setIndex: 0,
      weight: 175, unit: 'lb' as const, reps: 5, isCompleted: true, completedAt: NOW, isWarmup: false,
    }
    await expect(upsertSet(set)).rejects.toBeInstanceOf(HistoryImmutableError)
  })

  it('upsertSet on a frozen instance with allowHistoryEdit succeeds', async () => {
    await db.workoutInstances.add(makeInstance({ frozen: true, status: 'completed' }))
    const set = {
      id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: 'ex_1', setIndex: 0,
      weight: 180, unit: 'lb' as const, reps: 5, isCompleted: true, completedAt: NOW, isWarmup: false,
    }
    await upsertSet(set, { allowHistoryEdit: true })
    expect((await db.strengthSets.get('set_1'))?.weight).toBe(180)
  })

  it('completeWorkout with partiallyCompleted sets that status, freezes the instance, and appends a PARTIAL event', async () => {
    await db.workoutInstances.add(makeInstance({ status: 'inProgress' }))
    await completeWorkout({ id: 'wi_1', state: 'partiallyCompleted', forDate: '2026-07-27', now: NOW })
    const instance = await db.workoutInstances.get('wi_1')
    expect(instance?.status).toBe('partiallyCompleted')
    expect(instance?.frozen).toBe(true)
    const events = await listEvents()
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('PARTIAL')
  })

  it('completeWorkout with completed appends a COMPLETE event carrying forDate', async () => {
    await db.workoutInstances.add(makeInstance({ status: 'inProgress' }))
    await completeWorkout({ id: 'wi_1', state: 'completed', forDate: '2026-07-26', now: NOW })
    const events = await listEvents()
    expect(events[0]?.type).toBe('COMPLETE')
    expect(events[0]?.payload.forDate).toBe('2026-07-26')
    expect(events[0]?.instanceId).toBe('tmpl_1')
  })

  it('a partially completed instance is never readable as completed', async () => {
    await db.workoutInstances.add(makeInstance({ status: 'inProgress' }))
    await completeWorkout({ id: 'wi_1', state: 'partiallyCompleted', forDate: '2026-07-27', now: NOW })
    const instance = await db.workoutInstances.get('wi_1')
    expect(instance?.status).not.toBe('completed')
    expect(instance?.status).toBe('partiallyCompleted')
  })

  it('getInstanceWithPrescriptions returns prescriptions ordered by order', async () => {
    await db.workoutInstances.add(makeInstance())
    await db.instancePrescriptions.bulkAdd([
      { id: 'ip_b', instanceId: 'wi_1', exerciseId: 'ex_2', order: 1, restSec: 60, templateId: 'tmpl_1' },
      { id: 'ip_a', instanceId: 'wi_1', exerciseId: 'ex_1', order: 0, restSec: 90, templateId: 'tmpl_1' },
    ])
    const result = await getInstanceWithPrescriptions('wi_1')
    expect(result?.prescriptions.map((p) => p.id)).toEqual(['ip_a', 'ip_b'])
  })

  it('sets written before a refresh are still present after reopening the database', async () => {
    await db.workoutInstances.add(makeInstance())
    await db.strengthSets.add({
      id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: 'ex_1', setIndex: 0,
      weight: 175, unit: 'lb', reps: 5, isCompleted: true, completedAt: NOW, isWarmup: false,
    })
    db.close()
    await openDb()
    expect((await db.strengthSets.get('set_1'))?.weight).toBe(175)
  })
})
