import type { ISODate } from '@/domain/types'
import { addDays, compareDates, daysBetween, startOfIsoWeek } from '@/domain/dates'

/** Calendar days in one plan week. */
const DAYS_PER_WEEK = 7

export type ReanchorOutcome =
  /** The final week already coincides with race week — nothing to change. */
  | 'alreadyAligned'
  /** The plan start moves later so the final week is race week again. */
  | 'startShiftedLater'
  /** The race moved closer than the remaining plan is long. The start is left
   * alone deliberately (see below) and the athlete is told. */
  | 'raceMovedCloser'

export interface ReanchorDecision {
  /** The start date the plan should carry after this decision. Equal to
   * `currentStartDate` whenever `outcome` is not `startShiftedLater`. */
  startDate: ISODate
  /** Whole weeks the start moves by; `0` when it does not move. */
  shiftedWeeks: number
  outcome: ReanchorOutcome
  /** Athlete-facing sentence. Always populated — a schedule that silently
   * rearranges itself around race day is worse than one that says what it did. */
  explanation: string
}

/**
 * Re-establishes D1's invariant — the plan's FINAL week is race week, so the
 * taper lands correctly — after the athlete changes their race date mid-plan.
 *
 * Only ever moves the start LATER. Moving it earlier looks symmetrical and is
 * not: `placement.attemptOwnWeek` searches only within an instance's own plan
 * week (from `max(today, plannedDate)`), with a single following-week
 * escalation. Pulling the start backwards drags whole plan weeks into the past,
 * where they have no candidate days left, so the sessions in them are not
 * rescheduled — they are DROPPED, en masse, silently. Fitting a genuinely
 * shorter runway is compression (fewer weeks), which is a re-plan, not a shift;
 * §7's race-date anchoring already drops anything that would fall after race
 * day, so leaving the start put degrades gracefully instead of destructively.
 *
 * Pure: no clock reads, `today` is a parameter (it only ever appears in copy).
 */
export function reanchorToRaceDate(args: {
  currentStartDate: ISODate
  weeksCount: number
  raceDate: ISODate
}): ReanchorDecision {
  const raceWeekMonday = startOfIsoWeek(args.raceDate)
  const desiredStartDate = addDays(raceWeekMonday, -DAYS_PER_WEEK * (args.weeksCount - 1))
  const comparison = compareDates(desiredStartDate, args.currentStartDate)

  if (comparison === 0) {
    return {
      startDate: args.currentStartDate,
      shiftedWeeks: 0,
      outcome: 'alreadyAligned',
      explanation: `Week ${String(args.weeksCount)} still lands on race week, so no session dates changed.`,
    }
  }

  if (comparison < 0) {
    return {
      startDate: args.currentStartDate,
      shiftedWeeks: 0,
      outcome: 'raceMovedCloser',
      explanation: 'Race day is now closer than the remaining plan is long. Session dates are unchanged and nothing will be scheduled after race day — sessions that no longer fit are dropped rather than crammed in. Rebuild the plan from Settings if you want it compressed to the new date.',
    }
  }

  const shiftedWeeks = daysBetween(args.currentStartDate, desiredStartDate) / DAYS_PER_WEEK
  return {
    startDate: desiredStartDate,
    shiftedWeeks,
    outcome: 'startShiftedLater',
    explanation: `Race day moved later, so the plan shifts ${String(shiftedWeeks)} week${shiftedWeeks === 1 ? '' : 's'} to keep the taper on race week. Completed sessions keep their real dates; upcoming ones move.`,
  }
}
