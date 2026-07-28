import { db } from '@/data/db'
import type { ISODate, ISOInstant, InstancePrescription, StrengthSet, WorkoutInstance } from '@/data/types'
import type { SubstitutionKind } from '@/domain/symptoms/substitutions'
import { assertMutable } from './guard'
import { appendEvent } from './scheduleRepo'
import { getSettings } from './settingsRepo'
import { newId } from './ids'

/** `reduceImpactVolume` cuts an instance's prescribed run distance by this
 * fraction — 25% sits in the middle of the domain copy's stated 20-30% band
 * (see `@/domain/symptoms/substitutions`'s `reduceImpactVolume` detail text). */
const IMPACT_REDUCTION_FACTOR = 0.75
/** `swapHardRunForLowImpact` retargets a run prescription at this exercise —
 * matches the domain copy's own "SkiErg or rowing" wording. */
const LOW_IMPACT_SWAP_EXERCISE_ID = 'ex_ski_erg'

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

/**
 * Records a backdated completion: the athlete is logging a session that
 * actually happened on an earlier date. Distinct from `completeWorkout`'s
 * `'completed'` path (which stamps `forDate` as today) so replay (§ D11,
 * `@/domain/queue/replay.ts`) can tell "missed then logged after the fact"
 * apart from an on-time completion — `COMPLETE_EARLIER` is what lets the
 * placement engine treat the backdated day as occupied and potentially
 * reshuffle whatever else was scheduled there, which is exactly why callers
 * must follow this with `syncQueue`.
 */
export async function completeWorkoutEarlier(args: { id: string; forDate: ISODate; now: ISOInstant }): Promise<void> {
  await db.transaction('rw', db.workoutInstances, db.scheduleEvents, async () => {
    const instance = await loadInstanceOrThrow(args.id)
    assertMutable(instance)
    await db.workoutInstances.put({
      ...instance, status: 'completed', completedAt: args.now, completedForDate: args.forDate, frozen: true,
    })
    await appendEvent({
      at: args.now, type: 'COMPLETE_EARLIER', instanceId: instance.templateId, payload: { forDate: args.forDate },
    })
  })
}

/** Appends a `DEFER` event; does not freeze or otherwise directly touch the
 * instance row — the queue engine's own replay (`@/domain/queue/replay.ts`)
 * is what turns a `DEFER` event into a `deferred` status and a rescheduled
 * date, on the next `syncQueue` call. */
export async function deferWorkout(args: { id: string; now: ISOInstant }): Promise<void> {
  const instance = await loadInstanceOrThrow(args.id)
  assertMutable(instance)
  await appendEvent({ at: args.now, type: 'DEFER', instanceId: instance.templateId, payload: {} })
}

/** Appends a `SKIP` event; same division of labour as `deferWorkout` — the
 * queue engine's replay derives the `skipped` status from event history, not
 * a direct write here. */
export async function skipWorkout(args: { id: string; now: ISOInstant }): Promise<void> {
  const instance = await loadInstanceOrThrow(args.id)
  assertMutable(instance)
  await appendEvent({ at: args.now, type: 'SKIP', instanceId: instance.templateId, payload: {} })
}

/**
 * Accepts a symptom-driven `Substitution` (see `@/domain/symptoms/substitutions`)
 * by mutating ONLY this instance's own `InstancePrescription` rows — never
 * the `Prescription` template rows a future instance would materialize
 * from — so accepting a suggestion for this week never silently changes
 * every future week's plan. Kinds with no instance-level prescription change
 * (holding load progression is already handled by the recommendation engine
 * reading symptom state directly; seeking assessment / stopping an exercise
 * are informational) are a documented no-op here — accepting them is still a
 * real action from the athlete's point of view (dismissing the suggestion),
 * just not one that touches `InstancePrescription` rows.
 */
export async function applySubstitution(
  args: { instanceId: string; kind: SubstitutionKind; factor?: number },
): Promise<void> {
  const instance = await loadInstanceOrThrow(args.instanceId)
  assertMutable(instance)
  const prescriptions = await db.instancePrescriptions.where('instanceId').equals(args.instanceId).toArray()

  if (args.kind === 'reduceImpactVolume') {
    // `factor` lets "Modify" (the card's finer-control action) apply a
    // custom reduction instead of the default 25% — still only ever a
    // reduction, never an increase, since the whole point is easing load.
    const factor = args.factor ?? IMPACT_REDUCTION_FACTOR
    for (const p of prescriptions) {
      if (p.distanceM === undefined) continue
      await db.instancePrescriptions.put({ ...p, distanceM: Math.round(p.distanceM * factor) })
    }
    return
  }

  if (args.kind === 'swapHardRunForLowImpact') {
    for (const p of prescriptions) {
      const exercise = await db.exercises.get(p.exerciseId)
      if (exercise?.category !== 'run') continue
      await db.instancePrescriptions.put({ ...p, exerciseId: LOW_IMPACT_SWAP_EXERCISE_ID })
    }
  }
  // maintainCalfTibialis / holdLoadProgression / seekAssessment /
  // stopAggravatingExercise: no InstancePrescription mutation — see doc comment.
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
