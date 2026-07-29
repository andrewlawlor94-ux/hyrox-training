import { exerciseHistory, listExercises, listSymptomLogs } from '@/data/repositories'
import type { Exercise, ISODate } from '@/data/types'
import { evaluateSymptoms } from '@/domain/symptoms/evaluate'
import { recommendStrengthTarget } from '@/domain/recommendations/strengthTarget'
import type { StrengthRecommendation, StrengthSessionHistory } from '@/domain/recommendations/strengthTarget'
import type { SessionPerformance } from '@/domain/strength/oneRepMax'

export interface ExerciseWithHistory {
  exercise: Exercise
  sessions: SessionPerformance[]
}

/**
 * Every non-archived exercise that has at least one usable logged session,
 * for the Strength progress picker (§17). `exerciseHistory` already excludes
 * warm-up and incomplete sets, so "has history" here means "has something
 * worth charting", not merely "has a row somewhere".
 *
 * Pure read (safe inside `useLiveQuery`): `listExercises`/`exerciseHistory`
 * never write.
 */
export async function loadExercisesWithHistory(): Promise<ExerciseWithHistory[]> {
  const exercises = await listExercises()
  const withHistory: ExerciseWithHistory[] = []
  for (const exercise of exercises) {
    const sessions = await exerciseHistory(exercise.id)
    if (sessions.length > 0) withHistory.push({ exercise, sessions })
  }
  return withHistory
}

/**
 * Builds the recommendation engine's input from raw history using the
 * exercise's OWN defaults for `prescribedSets`/`prescribedRepMin` — Progress
 * has no single owning `InstancePrescription` to read those from (unlike
 * `useWorkout`'s `buildRecommendation`, which has one specific instance in
 * scope), and the exercise's defaults are the same approximation already
 * accepted there for "what was prescribed at the time".
 */
export async function buildRecommendationForExercise(
  exercise: Exercise,
  sessions: SessionPerformance[],
  today: ISODate,
): Promise<StrengthRecommendation> {
  const history: StrengthSessionHistory[] = sessions.map((session) => ({
    date: session.date,
    prescribedSets: exercise.defaultSets ?? session.sets.length,
    prescribedRepMin: exercise.repMin ?? 0,
    completedSets: session.sets.map((set) => ({
      weight: set.weight, unit: set.unit, reps: set.reps, ...(set.rir !== undefined ? { rir: set.rir } : {}),
    })),
  }))

  const symptomLogs = await listSymptomLogs()
  const symptomState = evaluateSymptoms(symptomLogs, today)

  return recommendStrengthTarget({
    exercise,
    prescription: { loadUnit: exercise.defaultUnit },
    history,
    today,
    symptoms: { shin: symptomState.shin, sciatic: symptomState.sciatic },
  })
}
