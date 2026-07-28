import { db } from '@/data/db'
import type { ISODate, ISOInstant, InstancePrescription, StrengthSet, WorkoutInstance } from '@/data/types'
import { assertMutable } from './guard'
import { appendEvent } from './scheduleRepo'
import { getSettings } from './settingsRepo'
import { newId } from './ids'

export async function getTodaysWorkout(today: ISODate): Promise<WorkoutInstance | undefined> {
  const settings = await getSettings()
  const candidates = await db.workoutInstances.where('scheduledDate').equals(today).toArray()
  return candidates.find((i) => i.planId === settings.activePlanId)
}

export async function getInstanceWithPrescriptions(
  id: string,
): Promise<{ instance: WorkoutInstance; prescriptions: InstancePrescription[] } | undefined> {
  const instance = await db.workoutInstances.get(id)
  if (!instance) return undefined
  const prescriptions = await db.instancePrescriptions.where('instanceId').equals(id).sortBy('order')
  return { instance, prescriptions }
}

async function loadInstanceOrThrow(id: string): Promise<WorkoutInstance> {
  const instance = await db.workoutInstances.get(id)
  if (!instance) throw new Error(`No WorkoutInstance "${id}"`)
  return instance
}

/** Starting is itself a write to history-adjacent state, guarded like every
 * other instance mutation. `startedAt` is set once and preserved on a
 * repeat call rather than overwritten with a later `now`. */
export async function startWorkout(id: string, now: ISOInstant): Promise<void> {
  const instance = await loadInstanceOrThrow(id)
  assertMutable(instance)
  await db.workoutInstances.put({ ...instance, status: 'inProgress', startedAt: instance.startedAt ?? now })
}

/**
 * Freezes the instance and appends the terminal event in the same
 * transaction, per §the immutability property: an instance must never be
 * observably `completed`/`partiallyCompleted` while still mutable, and the
 * event that will make future `syncQueue` runs respect this date must never
 * be recorded without the freeze (or vice versa) landing too.
 */
export async function completeWorkout(args: { id: string; state: 'completed' | 'partiallyCompleted'; forDate: ISODate; now: ISOInstant }): Promise<void> {
  await db.transaction('rw', db.workoutInstances, db.scheduleEvents, async () => {
    const instance = await loadInstanceOrThrow(args.id)
    assertMutable(instance)
    await db.workoutInstances.put({
      ...instance, status: args.state, completedAt: args.now, completedForDate: args.forDate, frozen: true,
    })
    await appendEvent({
      at: args.now,
      type: args.state === 'completed' ? 'COMPLETE' : 'PARTIAL',
      instanceId: instance.templateId,
      payload: { forDate: args.forDate },
    })
  })
}

async function nextSetIndex(instanceId: string, instancePrescriptionId: string): Promise<number> {
  const existing = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
  const forPrescription = existing.filter((s) => s.instancePrescriptionId === instancePrescriptionId)
  const maxIndex = forPrescription.reduce((max, s) => Math.max(max, s.setIndex), -1)
  return maxIndex + 1
}

/** A freshly added set prefills nothing: no weight, reps, unit, or rir until
 * the athlete actually logs them. */
export async function addSet(args: { instanceId: string; instancePrescriptionId: string; now: ISOInstant }): Promise<StrengthSet> {
  const instance = await loadInstanceOrThrow(args.instanceId)
  assertMutable(instance)
  const prescription = await db.instancePrescriptions.get(args.instancePrescriptionId)
  if (!prescription) throw new Error(`No InstancePrescription "${args.instancePrescriptionId}"`)

  const set: StrengthSet = {
    id: newId('set'),
    instanceId: args.instanceId,
    instancePrescriptionId: args.instancePrescriptionId,
    exerciseId: prescription.exerciseId,
    setIndex: await nextSetIndex(args.instanceId, args.instancePrescriptionId),
    isCompleted: false,
    isWarmup: false,
  }
  await db.strengthSets.add(set)
  return set
}

export async function removeSet(setId: string): Promise<void> {
  const set = await db.strengthSets.get(setId)
  if (!set) return
  const instance = await loadInstanceOrThrow(set.instanceId)
  assertMutable(instance)
  await db.strengthSets.delete(setId)
}

/** Guarded: writes are rejected once the owning instance is frozen, unless
 * `allowHistoryEdit` is passed explicitly (the one deliberate "edit a past
 * session" path — never a default). */
export async function upsertSet(set: StrengthSet, opts?: { allowHistoryEdit?: boolean }): Promise<void> {
  const instance = await loadInstanceOrThrow(set.instanceId)
  assertMutable(instance, opts)
  await db.strengthSets.put(set)
}

/**
 * Idempotent by construction: an already-completed set returns immediately,
 * before even loading the owning instance, so a double-tap can never throw
 * `HistoryImmutableError` even if the instance has since been frozen — it is
 * a true no-op, not a guarded write that happens to succeed twice.
 */
export async function completeSet(setId: string, now: ISOInstant): Promise<void> {
  const set = await db.strengthSets.get(setId)
  if (!set) return
  if (set.isCompleted) return

  const instance = await loadInstanceOrThrow(set.instanceId)
  assertMutable(instance)
  await db.strengthSets.put({ ...set, isCompleted: true, completedAt: now })
}
