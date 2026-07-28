import type { Exercise } from '@/data/types'
import type { StrengthRecommendation } from '@/domain/recommendations/strengthTarget'
import { formatLoad } from '@/domain/units/format'

/** Load styles where the athlete supplies no external load at all — the
 * exercise IS the load, so a target of "0" is always a real, useful answer
 * ("just body weight"), never a missing one. */
const BODY_WEIGHT_LOAD_STYLES: ReadonlySet<Exercise['loadStyle']> = new Set(['bodyWeight', 'bodyWeightPlusLoad'])

export function isBodyWeightStyle(loadStyle: Exercise['loadStyle']): boolean {
  return BODY_WEIGHT_LOAD_STYLES.has(loadStyle)
}

/**
 * True when the recommended target load is one the app never actually knows
 * — `recommendStrengthTarget`'s "no history" fallback reads
 * `prescription.targetLoad ?? 0`, and for anything OTHER than a body-weight
 * movement (a barbell/dumbbell/machine load genuinely defaults to some real
 * plate/pin setting once seeded, or is simply unset for a fresh/custom
 * exercise), a literal "0 lb" target is not a recommendation at all — it's
 * the absence of one. Athlete-facing copy must say so plainly rather than
 * printing a number nobody chose ("target: 0 lb" reads as broken standing at
 * a machine). Gated on `previous === null` too: once real history exists,
 * whatever `target` holds came from an actual rule (repeat/increase/hold),
 * not this fallback, even if it happens to equal zero.
 */
export function hasUnknownLoad(exercise: Exercise, recommendation: StrengthRecommendation): boolean {
  return recommendation.previous === null && recommendation.target.value === 0 && !isBodyWeightStyle(exercise.loadStyle)
}

/**
 * The load half of "Today's target: … × N reps" when a load IS being shown
 * — callers must check `hasUnknownLoad` first and render the "set your own
 * load" copy instead when it's true. Renders "body weight" for a literal
 * zero on a body-weight movement (still a real, correct value — the athlete
 * added no external load), the formatted load otherwise.
 */
export function targetLoadLabel(exercise: Exercise, recommendation: StrengthRecommendation): string {
  if (isBodyWeightStyle(exercise.loadStyle) && recommendation.target.value === 0) return 'body weight'
  return formatLoad(recommendation.target)
}
