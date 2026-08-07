import type { ISODate, RecoveryTag, SymptomStream, WorkoutInstance, WorkoutStatus } from '@/data/types'
import type { SymptomAdvice } from '@/domain/symptoms/substitutions'
import { compareDates, addDays } from '@/domain/dates'

/** Which `RecoveryTag`s make an instance "affected" by a given symptom
 * stream — a shin-flagged suggestion only makes sense against running/
 * high-impact work; a sciatic-flagged one against running or lower-body
 * loading. Deliberately feature-layer (not domain): it is a UI matching
 * decision about which upcoming sessions to act on, not a clinical rule. */
const AFFECTED_TAGS: Record<SymptomStream, readonly RecoveryTag[]> = {
  shin: ['hardRun', 'easyRun', 'longRun', 'highImpactStation'],
  sciatic: ['hardRun', 'lowerBodyStrength', 'highImpactStation'],
}

/** Statuses still ahead of the athlete — advice never applies to history that
 * already happened, and never counts as auto-cancelling anything since it never
 * touches `status` at all. */
const SCHEDULABLE_STATUSES: readonly WorkoutStatus[] = ['upcoming', 'available', 'inProgress']

/**
 * How far ahead a symptom suggestion reaches: the next seven days, today
 * included.
 *
 * Every piece of this advice is worded "this week" — cut volume this week, swap
 * a hard run this week — because that is the horizon a symptom report can
 * honestly speak to. It previously reached across the ENTIRE remaining plan, so
 * one sore shin rewrote sessions six months out, which is neither what the copy
 * says nor something anyone would want.
 */
export const SUGGESTION_WINDOW_DAYS = 7

/**
 * The still-scheduled sessions in the next week that a stream's advice would
 * actually change, in date order.
 *
 * Returns the instances themselves rather than a flattened per-suggestion list:
 * one instruction applies to several sessions, and the card says how many.
 */
export function sessionsForStream(
  instances: readonly WorkoutInstance[], stream: SymptomStream, today: ISODate,
): WorkoutInstance[] {
  const horizon = addDays(today, SUGGESTION_WINDOW_DAYS - 1)
  const tags = AFFECTED_TAGS[stream]
  return instances
    .filter((instance) => SCHEDULABLE_STATUSES.includes(instance.status))
    .filter((instance) => instance.scheduledDate !== null && instance.scheduledDate !== '')
    .filter((instance) => compareDates(instance.scheduledDate, today) >= 0 && compareDates(instance.scheduledDate, horizon) <= 0)
    .filter((instance) => instance.recoveryTags.some((tag) => tags.includes(tag)))
    .sort((a, b) => compareDates(a.scheduledDate, b.scheduledDate))
}

/**
 * The key recording that a piece of advice has been dismissed.
 *
 * Tied to the REPORT that raised it, not to the kind alone: dismissing today's
 * card must not silence the same advice after a fresh symptom report next week.
 * Lives here rather than beside the card so the component file exports only a
 * component (`react-refresh/only-export-components`).
 */
export function dismissalKey(advice: SymptomAdvice): string {
  return `${advice.stream}@${advice.triggeredOn ?? 'unknown'}`
}
