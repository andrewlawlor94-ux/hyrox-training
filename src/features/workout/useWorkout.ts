import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { addSet, exerciseHistory, getInstanceWithPrescriptions, listSymptomLogs, startWorkout } from '@/data/repositories'
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

/** `isMounted` is checked before every iteration so an unmount (navigating
 * away mid-materialization, or a test tearing down) stops the loop rather
 * than continuing to write against a component — or, in tests, a database —
 * that's already gone. Sequential, not `Promise.all`: `addSet` derives each
 * new set's index from the current max in the table, so concurrent calls
 * would race and could both compute the same `setIndex`. */
async function materializeSets(
  instanceId: string, instancePrescriptionId: string, count: number, isMounted: { current: boolean },
): Promise<void> {
  const now = new Date().toISOString()
  for (let i = 0; i < count; i += 1) {
    if (!isMounted.current) return
    await addSet({ instanceId, instancePrescriptionId, now })
  }
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
 *   in progress, completed, or frozen.
 * - Materializes one `StrengthSet` row per prescribed set the first time a
 *   strength prescription has none yet — the prescribed set COUNT is known
 *   immediately, but each row starts with no weight/reps until logged
 *   (`addSet`'s own contract), matching "prefilled" being a display concern,
 *   not a written one.
 */
export function useWorkout(instanceId: string, today: ISODate): WorkoutData | undefined {
  const data = useLiveQuery(() => loadWorkout(instanceId, today), [instanceId, today])
  const startedInstanceId = useRef<string | undefined>(undefined)
  const materializing = useRef<Set<string>>(new Set())
  const isMounted = useRef(true)

  useEffect(() => () => { isMounted.current = false }, [])

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
      if (materializing.current.has(item.prescription.id)) continue
      materializing.current.add(item.prescription.id)
      const count = item.prescription.sets ?? item.exercise.defaultSets ?? 1
      materializeSets(item.prescription.instanceId, item.prescription.id, count, isMounted).catch(() => {})
    }
  }, [data])

  return data
}
