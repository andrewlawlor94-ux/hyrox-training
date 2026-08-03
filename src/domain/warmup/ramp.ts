import type { Exercise, ExerciseCategory, Load, Unit } from '@/domain/types'

export interface WarmupSet {
  /** 1-based, so it reads as "warm-up 1" alongside "set 1". */
  index: number
  load: Load
  reps: number
  /** Percentage of the working load this step represents, for display. */
  percentOfWorking: number
}

/**
 * The ramp steps, as percentage of the day's working load and the reps to do at
 * each.
 *
 * A percentage ramp is standard strength-and-conditioning practice rather than a
 * result from one specific study, and the exact percentages vary between
 * coaches — so this is deliberately described as a CONVENTION, not "the"
 * formula. What the convention agrees on, and what this encodes: start light
 * enough to move freely, drop the reps as the load climbs so the warm-up does
 * not itself become fatiguing, and finish close enough to the working weight
 * that the first working set is not a shock.
 *
 * Reps fall as load rises for exactly that reason: 5 reps at 85% would be a
 * working set, not a warm-up.
 */
const RAMP_STEPS: readonly { percent: number; reps: number }[] = [
  { percent: 40, reps: 5 },
  { percent: 55, reps: 5 },
  { percent: 70, reps: 3 },
  { percent: 85, reps: 2 },
]

const PERCENT = 100
/** Below this the ramp is noise: a 20 kg working weight does not need four
 * lighter sets, and the athlete would spend longer warming up than lifting. */
const MIN_WORKING_LOAD_FOR_RAMP = 40
/** Rounding step when the exercise declares no usable increment. Barbell plates
 * come in pairs, so 5 lb / 2.5 kg is the smallest honest jump either way. */
const FALLBACK_STEP_LB = 5
const FALLBACK_STEP_KG = 2.5

/**
 * Load styles a ramp makes sense for.
 *
 * A barbell lift is the case: you physically have to load the bar in stages.
 * Machine stacks and dumbbells get one — changing a pin or picking up lighter
 * bells is just as easy. Body-weight and custom movements do not: there is no
 * load to ramp, and offering "40% of body weight" would be nonsense.
 */
const RAMPABLE_LOAD_STYLES: readonly Exercise['loadStyle'][] = ['totalBarbell', 'perDumbbell', 'machineStack']

/**
 * COMPOUND movements only — the athlete asked for "warm up reps for compound
 * moves", and that limit is right on its own terms: a Pallof press or a calf
 * raise does not need four progressively heavier sets to prepare for, and
 * offering them made the card read as noise. Multi-joint patterns that move real
 * load are what benefit from a ramp.
 */
const COMPOUND_CATEGORIES: readonly ExerciseCategory[] = ['squat', 'hinge', 'lunge', 'press', 'pull']

function roundingStep(exercise: Exercise, unit: Unit): number {
  const increment = exercise.progressionIncrement
  if (increment > 0 && exercise.incrementUnit === unit) return increment
  return unit === 'kg' ? FALLBACK_STEP_KG : FALLBACK_STEP_LB
}

/** Rounds DOWN to something actually loadable: a warm-up rounded up can exceed
 * the next step, and at the top of the ramp could exceed the working weight. */
function roundToLoadable(value: number, step: number): number {
  if (step <= 0) return value
  return Math.floor(value / step) * step
}

/**
 * Warm-up sets leading to `workingLoad`, prefilled and ready to log.
 *
 * Returns an EMPTY array rather than a token set when a ramp would not help:
 * an isolation movement, a movement with no rampable load, or a working weight
 * light enough that lighter sets are pointless. An empty warm-up is an honest answer; four
 * meaningless rows are not.
 *
 * Steps that round to the same loadable weight collapse into one — near the
 * bottom of the ramp 40% and 55% of a light bar can both land on the same plate
 * jump, and showing the same weight twice reads as a bug.
 *
 * Pure: no clock, no I/O, no randomness.
 */
export function warmupRampFor(exercise: Exercise, workingLoad: Load): WarmupSet[] {
  if (!COMPOUND_CATEGORIES.includes(exercise.category)) return []
  if (!RAMPABLE_LOAD_STYLES.includes(exercise.loadStyle)) return []
  if (!Number.isFinite(workingLoad.value) || workingLoad.value < MIN_WORKING_LOAD_FOR_RAMP) return []

  const step = roundingStep(exercise, workingLoad.unit)
  const sets: WarmupSet[] = []
  const seenValues = new Set<number>()

  for (const rampStep of RAMP_STEPS) {
    const raw = (workingLoad.value * rampStep.percent) / PERCENT
    const value = roundToLoadable(raw, step)
    // Nothing below one loadable step, and never a duplicate or the working
    // weight itself — the working sets already cover that.
    if (value < step || value >= workingLoad.value) continue
    if (seenValues.has(value)) continue
    seenValues.add(value)
    sets.push({
      index: sets.length + 1,
      load: { value, unit: workingLoad.unit },
      reps: rampStep.reps,
      percentOfWorking: rampStep.percent,
    })
  }

  return sets
}
