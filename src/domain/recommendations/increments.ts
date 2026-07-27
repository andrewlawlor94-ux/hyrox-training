import type { Exercise, ExerciseCategory, Load, SymptomLevel, SymptomStream } from '@/domain/types'

/**
 * Minimal shape of Task 8's future `SymptomState`, declared locally to avoid
 * a circular dependency between the recommendations engine (this task) and
 * the symptom evaluator (Task 8, not yet written). Task 8's `SymptomState`
 * will structurally satisfy this interface, so no import from
 * `@/domain/symptoms` is needed here.
 */
export interface RecommendationSymptomState {
  shin: { level: SymptomLevel; spikeFlag: boolean; persistenceFlag: boolean }
  sciatic: { level: SymptomLevel; spikeFlag: boolean; persistenceFlag: boolean }
}

/**
 * The load jump to apply on a qualifying `increase`/`optionalIncrease`
 * recommendation. Read straight off the exercise: seeded/user-edited
 * `progressionIncrement` + `incrementUnit` already encode the right jump for
 * that exercise (including 0 for competition-standard station loads).
 */
export function effectiveIncrement(exercise: Exercise): Load {
  return { value: exercise.progressionIncrement, unit: exercise.incrementUnit }
}

/**
 * Exhaustive map from exercise category to the symptom stream that gates its
 * progression. Declaring this as `Record<ExerciseCategory, ...>` (rather than
 * a partial map with a default) makes adding a new category to
 * `ExerciseCategory` a compile error until it is mapped here.
 */
const GATING_SYMPTOM_BY_CATEGORY: Record<ExerciseCategory, SymptomStream | null> = {
  // Spinal-loading categories: sciatic/back symptoms gate progression.
  squat: 'sciatic',
  hinge: 'sciatic',
  lunge: 'sciatic',
  carry: 'sciatic',
  // Impact categories: shin symptoms gate progression.
  plyo: 'shin',
  run: 'shin',
  // Ungated: upper-body / non-spinal, non-impact categories.
  press: null,
  pull: null,
  core: null,
  // Calf and tibialis work is the *treatment* for shin symptoms, not a
  // driver of them — gating it would withhold the remedy, so it is
  // deliberately left ungated even though shin gates 'plyo' and 'run'.
  calf: null,
  erg: null,
  accessory: null,
  // Sled and wall-ball loads are fixed by competition standard and never
  // auto-progress (STATION_INCREMENT = 0 in constants.ts), so there is
  // nothing for a symptom to gate.
  sled: null,
  wallBall: null,
}

export function gatingSymptomFor(category: ExerciseCategory): SymptomStream | null {
  return GATING_SYMPTOM_BY_CATEGORY[category]
}

/**
 * True when the exercise's gating symptom stream (if any) is currently
 * elevated, spiking, or persistent. A category with no gating stream (e.g.
 * `press`, `calf`) is never gated, regardless of symptom state.
 */
export function isSymptomGated(exercise: Exercise, symptoms: RecommendationSymptomState): boolean {
  const stream = gatingSymptomFor(exercise.category)
  if (stream === null) return false
  const state = symptoms[stream]
  return state.level === 'elevated' || state.spikeFlag || state.persistenceFlag
}
