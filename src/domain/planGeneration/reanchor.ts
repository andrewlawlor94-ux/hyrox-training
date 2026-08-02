import type { ISODate } from '@/domain/types'
import { addDays, compareDates, daysBetween, startOfIsoWeek } from '@/domain/dates'
import { PLAN_WEEKS_DEFAULT } from './constants'

/** Calendar days in one plan week. */
const DAYS_PER_WEEK = 7
/** A plan always has at least one core week — a race this week still gets a
 * race week. */
const MIN_CORE_WEEKS = 1

export type ReanchorOutcome =
  /** The plan already ends on race week at its current length. */
  | 'alreadyAligned'
  /** The runway shrank: the core block is compressed so the taper lands on race
   * week instead of sessions piling up after race day. */
  | 'compressed'
  /** The runway grew but the plan is already the full 24 core weeks, so the
   * START moves later rather than inventing weeks the seed does not have. */
  | 'startShiftedLater'
  /** The runway grew and the core block had previously been compressed, so it
   * is restored toward the full 24 weeks. */
  | 'extended'

export interface ReanchorDecision {
  /** The start date the plan should carry. Only ever moves LATER — see below. */
  startDate: ISODate
  /** The core-week count the plan should carry, clamped to [1, 24]. */
  coreWeeks: number
  /** Whole weeks the start moves by; `0` when it does not move. */
  shiftedWeeks: number
  outcome: ReanchorOutcome
  /** Athlete-facing sentence. Always populated — a plan that silently
   * rearranges itself around race day is worse than one that says what it did. */
  explanation: string
}

function weeksInclusive(fromMonday: ISODate, toMonday: ISODate): number {
  return daysBetween(fromMonday, toMonday) / DAYS_PER_WEEK + 1
}

/**
 * Re-fits the plan to its race date (D1: the final week IS race week, so the
 * taper lands correctly), by adjusting the CORE WEEK COUNT and, only when the
 * plan is already at full length, the start date.
 *
 * This replaces an earlier version that only ever shifted the start and
 * explicitly refused to compress. That was wrong, and the athlete found exactly
 * why: moving a race from 24 weeks out to 8 weeks out left a 24-week plan in
 * place, so weeks 9-24 fell after race day and were all auto-dropped. The Plan
 * tab then showed sixteen weeks of "Done" (a dropped week counted as done), and
 * Manage plans still reported 24 core weeks. Nothing about that reads as a plan.
 *
 * The start still only ever moves LATER, and that part was right: pulling it
 * backwards drags whole plan weeks into the past, where `placement.attemptOwnWeek`
 * finds no candidate day and their sessions are DROPPED rather than moved.
 * Shortening the plan is what fits a shorter runway; moving the start earlier
 * just destroys sessions.
 *
 * Pure: no clock reads, `today` is not needed — everything is derived from the
 * plan's own start, its base-week count, and race day.
 */
export function reanchorToRaceDate(args: {
  currentStartDate: ISODate
  /** Generated Base ("Prologue") weeks, which sit BEFORE the core block and are
   * anchored to history, so they are never compressed away here. */
  baseWeeks: number
  /** The plan's current core-week count. */
  currentCoreWeeks: number
  raceDate: ISODate
}): ReanchorDecision {
  const { currentStartDate, baseWeeks, currentCoreWeeks, raceDate } = args
  const startMonday = startOfIsoWeek(currentStartDate)
  const raceMonday = startOfIsoWeek(raceDate)

  // Weeks available from where the plan already starts through race week.
  const available = weeksInclusive(startMonday, raceMonday)
  const coreRoom = available - baseWeeks
  const desiredCore = Math.min(PLAN_WEEKS_DEFAULT, Math.max(MIN_CORE_WEEKS, coreRoom))

  if (desiredCore !== currentCoreWeeks) {
    const shorter = desiredCore < currentCoreWeeks
    return {
      startDate: currentStartDate,
      coreWeeks: desiredCore,
      shiftedWeeks: 0,
      outcome: shorter ? 'compressed' : 'extended',
      explanation: shorter
        ? `Race day is closer, so the plan is now ${String(desiredCore)} core weeks instead of ${String(currentCoreWeeks)} — the sharpest weeks are kept and the taper still lands on race week. Completed sessions are untouched.`
        : `Race day is further out, so the plan grows back to ${String(desiredCore)} core weeks. Completed sessions are untouched.`,
    }
  }

  // Already the right length. If the plan still ends before race week (only
  // possible at full length with a long runway), move the start later so the
  // taper lands on race week.
  const totalWeeks = baseWeeks + currentCoreWeeks
  const desiredStart = addDays(raceMonday, -DAYS_PER_WEEK * (totalWeeks - 1))
  const comparison = compareDates(desiredStart, startMonday)

  if (comparison <= 0) {
    return {
      startDate: currentStartDate,
      coreWeeks: currentCoreWeeks,
      shiftedWeeks: 0,
      outcome: 'alreadyAligned',
      explanation: `Week ${String(totalWeeks)} still lands on race week, so no session dates changed.`,
    }
  }

  const shiftedWeeks = daysBetween(startMonday, desiredStart) / DAYS_PER_WEEK
  return {
    startDate: desiredStart,
    coreWeeks: currentCoreWeeks,
    shiftedWeeks,
    outcome: 'startShiftedLater',
    explanation: `Race day moved later, so the plan shifts ${String(shiftedWeeks)} week${shiftedWeeks === 1 ? '' : 's'} to keep the taper on race week. Completed sessions keep their real dates; upcoming ones move.`,
  }
}
