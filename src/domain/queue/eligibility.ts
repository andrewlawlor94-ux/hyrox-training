import type { ISODate, RecoveryTag } from '@/domain/types'
import { addDays, compareDates, daysBetween } from '@/domain/dates'
import type { Conflict } from './recoveryMatrix'
import { conflictBetween } from './recoveryMatrix'
import { ADJACENT_DAY_SPAN, ROLLING_WINDOW_DAYS, SIMULATION_CLEAR_DAYS_AFTER, MIN_REST_DAYS_PER_ROLLING_WINDOW } from './constants'

/** A day that already has a workout, for eligibility purposes. */
export interface OccupiedDay {
  date: ISODate
  tags: RecoveryTag[]
  /** Set to the session's name when this day is occupied because that
   * session's completion was backdated (a COMPLETE_EARLIER event), rather
   * than because it was actually scheduled there. Lets a session displaced
   * by this day attribute the move to the backdated completion instead of
   * claiming it "was missed" (`backdatedExplanation` in explain.ts). */
  backdatedName?: string
}

export interface EligibilityResult {
  eligible: boolean
  conflicts: Conflict[]
  blockedBy: 'dayOccupied' | 'restDayRule' | 'recoveryConflict' | 'pastRaceDate' | null
}

/** Tags heavy enough that resuming them too soon after a race simulation
 * defeats the point of the simulation (§15). `raceSimulation` itself is
 * included so back-to-back simulations are also gated. */
const HARD_WORK_TAGS: readonly RecoveryTag[] = ['hardRun', 'longRun', 'lowerBodyStrength', 'raceSimulation']

/**
 * A race simulation needs `SIMULATION_CLEAR_DAYS_AFTER` clear days before
 * hard work resumes. Unlike the pairwise matrix (adjacent days only), this
 * looks back across a multi-day window because the recovery demand of a
 * full simulation outlasts a single day.
 */
export function simulationClearanceConflict(
  occupied: OccupiedDay[],
  candidate: ISODate,
  candidateTags: RecoveryTag[],
): Conflict | null {
  if (!candidateTags.some((tag) => HARD_WORK_TAGS.includes(tag))) return null

  for (const day of occupied) {
    if (!day.tags.includes('raceSimulation')) continue
    const gap = daysBetween(day.date, candidate)
    if (gap >= ADJACENT_DAY_SPAN && gap <= SIMULATION_CLEAR_DAYS_AFTER) {
      return {
        severity: 'hard',
        reason: 'A race simulation needs clear recovery days before hard work resumes.',
        againstDate: day.date,
      }
    }
  }
  return null
}

/**
 * Every window of `ROLLING_WINDOW_DAYS` that contains `candidate` — not just
 * the trailing window ending at `candidate` — must keep at least
 * `MIN_REST_DAYS_PER_ROLLING_WINDOW` free days once `candidate` itself is
 * occupied. Checking windows that start *after* `candidate` as well as
 * before it is what catches a candidate slotting into an already-full
 * future stretch.
 */
function violatesRestDayRule(candidate: ISODate, occupied: OccupiedDay[]): boolean {
  const occupiedDates = new Set(occupied.map((o) => o.date))

  for (let startOffset = -(ROLLING_WINDOW_DAYS - 1); startOffset <= 0; startOffset += 1) {
    const windowStart = addDays(candidate, startOffset)
    let filled = 0
    for (let d = 0; d < ROLLING_WINDOW_DAYS; d += 1) {
      const day = addDays(windowStart, d)
      if (day === candidate || occupiedDates.has(day)) filled += 1
    }
    const free = ROLLING_WINDOW_DAYS - filled
    if (free < MIN_REST_DAYS_PER_ROLLING_WINDOW) return true
  }
  return false
}

/** Conflicts against the day immediately before and immediately after
 * `candidate` (span `ADJACENT_DAY_SPAN`). Days further away never conflict
 * via the pairwise matrix. */
function pairwiseConflicts(candidate: ISODate, candidateTags: RecoveryTag[], occupied: OccupiedDay[]): Conflict[] {
  const conflicts: Conflict[] = []
  for (const day of occupied) {
    const span = Math.abs(daysBetween(day.date, candidate))
    if (span !== ADJACENT_DAY_SPAN) continue

    const severity = compareDates(day.date, candidate) < 0
      ? conflictBetween(day.tags, candidateTags)
      : conflictBetween(candidateTags, day.tags)
    if (severity === null) continue

    conflicts.push({
      severity,
      reason: compareDates(day.date, candidate) < 0
        ? 'This session follows yesterday\'s session too closely for full recovery.'
        : 'This session is followed by tomorrow\'s session too closely for full recovery.',
      againstDate: day.date,
    })
  }
  return conflicts
}

export function isDayEligible(args: {
  candidate: ISODate
  candidateTags: RecoveryTag[]
  occupied: OccupiedDay[]
  raceDate: ISODate
  ignoreSoftConflicts?: boolean
}): EligibilityResult {
  const { candidate, candidateTags, occupied, raceDate, ignoreSoftConflicts = false } = args

  if (compareDates(candidate, raceDate) > 0) {
    return { eligible: false, conflicts: [], blockedBy: 'pastRaceDate' }
  }

  if (occupied.some((day) => day.date === candidate)) {
    return { eligible: false, conflicts: [], blockedBy: 'dayOccupied' }
  }

  if (violatesRestDayRule(candidate, occupied)) {
    return { eligible: false, conflicts: [], blockedBy: 'restDayRule' }
  }

  const allConflicts = pairwiseConflicts(candidate, candidateTags, occupied)
  const simConflict = simulationClearanceConflict(occupied, candidate, candidateTags)
  if (simConflict !== null) allConflicts.push(simConflict)

  const hasHardConflict = allConflicts.some((c) => c.severity === 'hard')
  const visibleConflicts = ignoreSoftConflicts ? allConflicts.filter((c) => c.severity !== 'soft') : allConflicts

  if (hasHardConflict) {
    return { eligible: false, conflicts: visibleConflicts, blockedBy: 'recoveryConflict' }
  }

  return { eligible: true, conflicts: visibleConflicts, blockedBy: null }
}
