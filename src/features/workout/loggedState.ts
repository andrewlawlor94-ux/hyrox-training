import type { PrimaryMeasureSpec } from '@/domain/logging/primaryMeasure'
import { countsAsDone, primaryMeasureFor } from '@/domain/logging/primaryMeasure'
import type { WorkoutExerciseVM } from './useWorkout'

export interface ExerciseLogState {
  /** True once this movement's deciding box holds a real value. */
  done: boolean
  spec: PrimaryMeasureSpec
}

/**
 * Whether one prescribed movement has actually been logged, judged only by its
 * own deciding box (`primaryMeasureFor`).
 *
 * Reads the STORED rows, not the on-screen text: what a completed session
 * records is what is in the database, and every block autosaves within a couple
 * of hundred milliseconds of a keystroke. A value the athlete has typed but not
 * yet had saved is not yet part of the record, and claiming otherwise would be
 * the more misleading of the two.
 */
export function exerciseLogState(item: WorkoutExerciseVM): ExerciseLogState {
  const spec = primaryMeasureFor(item.exercise.measurementType)

  if (item.kind === 'strength') {
    // One set with real reps is enough for the exercise to have happened — the
    // athlete may deliberately stop short of the prescribed set count.
    return { done: item.sets.some((set) => countsAsDone(set.reps)), spec }
  }

  if (item.kind === 'run') {
    // A `RunLog` only exists at all when distance AND duration are both real
    // (`isLoggableRun`), so its existence IS the deciding box for a run.
    return { done: item.log !== undefined, spec }
  }

  const log = item.log
  if (log === undefined) return { done: false, spec }
  const value = spec.measure === 'reps' ? log.reps : spec.measure === 'time' ? log.timeSec : log.distanceM
  return { done: countsAsDone(value), spec }
}

export interface SessionLogSummary {
  loggedCount: number
  total: number
  /** Names of the movements whose deciding box is still empty, in session
   * order — so the athlete is told WHICH ones, not just how many. */
  missing: string[]
}

/** How much of the session is on the record, for the footer to state before the
 * athlete commits to "Completed". */
export function sessionLogSummary(items: readonly WorkoutExerciseVM[]): SessionLogSummary {
  const missing: string[] = []
  let loggedCount = 0
  for (const item of items) {
    if (exerciseLogState(item).done) loggedCount += 1
    else missing.push(item.exercise.name)
  }
  return { loggedCount, total: items.length, missing }
}
