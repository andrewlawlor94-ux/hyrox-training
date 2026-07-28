import { buildBaseWeekRunEntries } from './runWeeks/weeksBase'
import { buildBuildWeekRunEntries } from './runWeeks/weeksBuild'
import { buildRaceSpecificWeekRunEntries } from './runWeeks/weeksRaceSpecific'
import { buildSpecificPrepWeekRunEntries } from './runWeeks/weeksSpecificPrep'
import { buildTaperWeekRunEntries } from './runWeeks/weeksTaper'
import { zone2MinutesFor } from './runWeeks/zone2'
import type { WeekRunEntry } from './runWeeks/types'

export type { WeekRunEntry } from './runWeeks/types'
export { buildZone2Template, zone2MinutesFor } from './runWeeks/zone2'
export { buildRaceWeekTechniqueTemplate } from './runWeeks/weeksTaper'

/**
 * The running progression for all 24 weeks (§8, §19): each week's easy run
 * (slot 2), quality run (slot 4), and slot-6 session (long run / hybrid /
 * simulation / benchmark / race), plus the Zone 2 duration for that week.
 * Assembled from five phase-scoped builder modules -- the assembly here is
 * the only "code"; the per-week content each module produces is generated
 * from small configuration tables, not hand-written per week (see each
 * module's own comments for its source data).
 *
 * Zone 2 minutes ramp 40 -> 50 linearly across the plan (weeks 1-22); the
 * two taper weeks pin their own explicit values instead (see `weeksTaper`).
 */
function buildRunProgression(): Record<number, WeekRunEntry> {
  const entries: Record<number, WeekRunEntry> = {
    ...buildBaseWeekRunEntries(),
    ...buildBuildWeekRunEntries(),
    ...buildRaceSpecificWeekRunEntries(),
    ...buildSpecificPrepWeekRunEntries(),
    ...buildTaperWeekRunEntries(),
  }
  for (let weekNumber = 1; weekNumber <= 22; weekNumber += 1) {
    const entry = entries[weekNumber]
    if (!entry) throw new Error(`Missing run-progression entry for week ${String(weekNumber)}`)
    entry.zone2Minutes = zone2MinutesFor(weekNumber)
  }
  return entries
}

export const RUN_PROGRESSION: Record<number, WeekRunEntry> = buildRunProgression()
