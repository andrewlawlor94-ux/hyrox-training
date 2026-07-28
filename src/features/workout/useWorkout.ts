import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { exerciseHistory, getInstanceWithPrescriptions, listSymptomLogs, startWorkout } from '@/data/repositories'
import type { Exercise, InstancePrescription, StationLog, StrengthSet, WorkoutInstance } from '@/data/types'
import type { ISODate } from '@/domain/types'
import { evaluateSymptoms } from '@/domain/symptoms/evaluate'
import { recommendStrengthTarget } from '@/domain/recommendations/strengthTarget'
import type { StrengthRecommendation, StrengthSessionHistory } from '@/domain/recommendations/strengthTarget'

export interface StrengthExerciseVM {
  kind: 'strength'
  prescription: InstancePrescription
  exercise: Exercise
  sets: StrengthSet[]
  recommendation: StrengthRecommendation
  /** Reps to prefill/display alongside the target weight. The recommendation
   * engine only returns a target LOAD, never a rep count, so the UI falls
   * back to whatever rep count the athlete actually hit last time (the
   * natural "repeat the working rep count" default), then the prescription's
   * own minimum, then zero. */
  targetReps: number
}

export interface StationExerciseVM {
  kind: 'station'
  prescription: InstancePrescription
  exercise: Exercise
  log: StationLog | undefined
}

export type WorkoutExerciseVM = StrengthExerciseVM | StationExerciseVM

export interface WorkoutData {
  instance: WorkoutInstance
  exercises: WorkoutExerciseVM[]
}

/**
 * Adapts `exerciseHistory`'s `SessionPerformance[]` (Task 6's shape) into the
 * recommendation engine's `StrengthSessionHistory[]` (Task 7's shape) and
 * calls it. `prescribedSets`/`prescribedRepMin` use the CURRENT prescription
 * as a stand-in for "what was prescribed at the time" — `exerciseHistory`
 * doesn't retain a historical prescription snapshot, and the plan's rep
 * scheme for a given exercise changes rarely enough that this is a fair
 * approximation, not a silent bug.
 */
async function buildRecommendation(
  exercise: Exercise,
  prescription: InstancePrescription,
  today: ISODate,
): Promise<StrengthRecommendation> {
  const sessions = await exerciseHistory(exercise.id)
  const history: StrengthSessionHistory[] = sessions.map((session) => ({
    date: session.date,
    prescribedSets: prescription.sets ?? exercise.defaultSets ?? session.sets.length,
    prescribedRepMin: prescription.repMin ?? exercise.repMin ?? 0,
    completedSets: session.sets.map((set) => ({
      weight: set.weight, unit: set.unit, reps: set.reps, ...(set.rir !== undefined ? { rir: set.rir } : {}),
    })),
  }))
  const symptomLogs = await listSymptomLogs()
  const symptomState = evaluateSymptoms(symptomLogs, today)
  return recommendStrengthTarget({
    exercise, prescription, history, today,
    symptoms: { shin: symptomState.shin, sciatic: symptomState.sciatic },
  })
}

function targetRepsFor(recommendation: StrengthRecommendation, prescription: InstancePrescription, exercise: Exercise): number {
  return recommendation.previous?.reps ?? prescription.repMin ?? exercise.repMin ?? 0
}

/** Pure read (safe inside `useLiveQuery`): every function reached from here
 * — `getInstanceWithPrescriptions`, `db.exercises.get`, `db.strengthSets`/
 * `db.stationLogs` queries, `exerciseHistory`, `listSymptomLogs`,
 * `evaluateSymptoms`, `recommendStrengthTarget` — only ever reads. */
async function loadWorkout(instanceId: string, today: ISODate): Promise<WorkoutData | undefined> {
  const loaded = await getInstanceWithPrescriptions(instanceId)
  if (!loaded) return undefined
  const { instance, prescriptions } = loaded

  const exercises: WorkoutExerciseVM[] = []
  for (const prescription of prescriptions) {
    const exercise = await db.exercises.get(prescription.exerciseId)
    if (!exercise) continue

    if (exercise.measurementType === 'strengthSets') {
      const sets = await db.strengthSets.where('instancePrescriptionId').equals(prescription.id).sortBy('setIndex')
      const recommendation = await buildRecommendation(exercise, prescription, today)
      exercises.push({
        kind: 'strength', prescription, exercise, sets, recommendation,
        targetReps: targetRepsFor(recommendation, prescription, exercise),
      })
    } else {
      // `stationLogs` indexes `instanceId`, not `instancePrescriptionId`
      // (see src/data/schema.ts) — filter in JS rather than adding a new
      // index, matching the pattern `workoutRepo.nextSetIndex` already uses
      // for the same reason.
      const instanceLogs = await db.stationLogs.where('instanceId').equals(prescription.instanceId).toArray()
      const log = instanceLogs.find((l) => l.instancePrescriptionId === prescription.id)
      exercises.push({ kind: 'station', prescription, exercise, log })
    }
  }

  return { instance, exercises }
}

/**
 * Ensures exactly `count` empty `StrengthSet` rows exist for a prescription,
 * using DETERMINISTIC ids (`${instancePrescriptionId}_s${index}`) and
 * `bulkPut` rather than the repo's `addSet` (which mints a random id and
 * derives its index from the current table max). That combination is what
 * makes this idempotent by construction rather than by a client-side "have I
 * already done this" flag: React 18 StrictMode deliberately double-invokes
 * effects in development (mount -> run effect -> simulate-unmount -> run
 * cleanup -> remount -> run effect again), and a ref-based dedup guard set
 * mid-flight by the FIRST invocation reads as "already handled" during the
 * SECOND invocation even though nothing had actually been written yet —
 * verified live in the browser, where that exact race left every strength
 * card with zero set rows. Calling this twice (or twenty times) concurrently
 * now just writes the same rows twice; `bulkPut` is a plain overwrite, no
 * unique-constraint error, no duplicate rows, no lost writes.
 */
async function ensureSetsExist(instancePrescriptionId: string, ctx: { instanceId: string; exerciseId: string }, count: number): Promise<void> {
  const rows: StrengthSet[] = Array.from({ length: count }, (_, index) => ({
    id: `${instancePrescriptionId}_s${String(index)}`,
    instanceId: ctx.instanceId,
    instancePrescriptionId,
    exerciseId: ctx.exerciseId,
    setIndex: index,
    isCompleted: false,
    isWarmup: false,
  }))
  await db.strengthSets.bulkPut(rows)
}

/**
 * Assembles everything `WorkoutScreen` needs for one instance: the instance
 * itself, and per prescription either a strength view-model (sets +
 * recommendation) or a station view-model. Two side effects run alongside
 * the live query, deliberately OUTSIDE it (writes are illegal inside a
 * `useLiveQuery` callback):
 *
 * - Marks the instance `inProgress` the first time it's opened (so Home can
 *   offer "Continue"), guarded so it never re-fires for an instance already
 *   in progress, completed, or frozen. `startWorkout` itself preserves an
 *   existing `startedAt`, so a repeat call is harmless.
 * - Ensures one `StrengthSet` row per prescribed set exists for every
 *   strength prescription — `ensureSetsExist` is naturally idempotent
 *   (deterministic ids + `bulkPut`), so this needs no client-side "already
 *   ran" flag; it simply re-checks `sets.length` on every live-query
 *   emission and no-ops once rows exist.
 */
export function useWorkout(instanceId: string, today: ISODate): WorkoutData | undefined {
  const data = useLiveQuery(() => loadWorkout(instanceId, today), [instanceId, today])
  const startedInstanceId = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (data === undefined) return
    const { instance } = data
    const alreadyInProgress = instance.status === 'inProgress' || instance.status === 'completed' || instance.status === 'partiallyCompleted'
    if (startedInstanceId.current !== instance.id && !instance.frozen && !alreadyInProgress) {
      startedInstanceId.current = instance.id
      // Best-effort: a rejection here (e.g. the database closing during an
      // unmount race in tests) has nothing useful to surface — there's no UI
      // left to show it to, and the live query will simply reflect whatever
      // the instance's real status is on the next read.
      startWorkout(instance.id, new Date().toISOString()).catch(() => {})
    }
  }, [data])

  useEffect(() => {
    if (data === undefined) return
    for (const item of data.exercises) {
      if (item.kind !== 'strength') continue
      if (item.sets.length > 0) continue
      const count = item.prescription.sets ?? item.exercise.defaultSets ?? 1
      ensureSetsExist(item.prescription.id, { instanceId: item.prescription.instanceId, exerciseId: item.exercise.id }, count).catch(() => {})
    }
  }, [data])

  return data
}
