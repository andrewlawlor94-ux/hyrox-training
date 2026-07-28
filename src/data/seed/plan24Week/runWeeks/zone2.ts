import { positiveRestSec } from '../stationCircuits'
import type { SeedTemplate } from '../types'

/** Zone 2 ramps 40 -> 50 minutes across the 24-week plan (§19), linearly by
 * week so no 24-entry literal table is needed. Taper weeks pin their own
 * explicit value (see `weeksTaper.ts`) rather than reading this ramp. */
export function zone2MinutesFor(weekNumber: number): number {
  const START_MIN = 40
  const END_MIN = 50
  const LAST_WEEK = 24
  return Math.round(START_MIN + ((END_MIN - START_MIN) * (weekNumber - 1)) / (LAST_WEEK - 1))
}

/** Alternates SkiErg and rower by week parity (§19). */
function zone2ExerciseIdFor(weekNumber: number): string {
  return weekNumber % 2 === 1 ? 'ex_ski_erg' : 'ex_row'
}

/** Zone 2 (slot 3): conversational-effort SkiErg or row. Always `optional` --
 * this is the session that disappears first when life intervenes (D7). */
export function buildZone2Template(weekNumber: number, minutes: number, sequenceInWeek: number): SeedTemplate {
  const exerciseId = zone2ExerciseIdFor(weekNumber)
  return {
    sessionSlot: 3,
    sequenceInWeek,
    name: 'Zone 2 conditioning',
    kind: 'zone2',
    priority: 'optional',
    recoveryTags: ['lowImpactAerobic'],
    estMinutes: minutes,
    prescriptions: [
      { exerciseId, order: 0, durationSec: minutes * 60, restSec: positiveRestSec(exerciseId, 60), notes: 'Conversational effort throughout.' },
    ],
  }
}
