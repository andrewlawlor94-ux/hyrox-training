import type { ISODate, Priority, RecoveryTag } from '@/domain/types'
import { addDays, compareDates } from '@/domain/dates'
import type { OccupiedDay } from './eligibility'
import { isDayEligible } from './eligibility'
import { backdatedExplanation, deferredExplanation, droppedExplanation, movedExplanation, weekdayName } from './explain'
import { AUTOMATED_PLACEMENT_WEEKDAYS_PER_WEEK, DAYS_PER_WEEK, PRIORITY_TIER_RANK } from './constants'

/** A not-yet-terminal instance still needing a placement decision. */
export interface OpenInstance {
  templateId: string
  weekNumber: number
  sequenceInWeek: number
  priority: Priority
  recoveryTags: RecoveryTag[]
  name: string
  plannedDate: ISODate
  /** True when an explicit DEFER event is the reason this instance is open —
   * it must land on a *different* day than `plannedDate`, not just an
   * eligible one, which is what distinguishes a deferral from ordinary
   * catch-up placement. */
  deferralRequested: boolean
}

export interface DroppedRecord {
  templateId: string
  priority: Priority
  reason: string
}

export interface PlacementOutcome {
  scheduledDate: ISODate | null
  explanation: string | null
  dropped: DroppedRecord | null
}

function laterOf(a: ISODate, b: ISODate): ISODate {
  return compareDates(a, b) >= 0 ? a : b
}

/** Every Monday-Saturday date in plan week `weekNumber`, restricted to
 * `[from, raceDate]`. Sunday is never a candidate for automated placement
 * (see `AUTOMATED_PLACEMENT_WEEKDAYS_PER_WEEK`). */
function candidateDaysForWeek(planStartDate: ISODate, weekNumber: number, from: ISODate, raceDate: ISODate): ISODate[] {
  const monday = addDays(planStartDate, (weekNumber - 1) * DAYS_PER_WEEK)
  const days: ISODate[] = []
  for (let offset = 0; offset < AUTOMATED_PLACEMENT_WEEKDAYS_PER_WEEK; offset += 1) {
    const day = addDays(monday, offset)
    if (compareDates(day, from) >= 0 && compareDates(day, raceDate) <= 0) days.push(day)
  }
  return days
}

function firstEligibleDay(days: ISODate[], tags: RecoveryTag[], occupied: OccupiedDay[], raceDate: ISODate): ISODate | null {
  for (const day of days) {
    if (isDayEligible({ candidate: day, candidateTags: tags, occupied, raceDate }).eligible) return day
  }
  return null
}

/** Step 8: the instance's own plan week, scanning forward from
 * `max(today, plannedDate)` (or `plannedDate + 1` for a deferral). */
function attemptOwnWeek(inst: OpenInstance, occupied: OccupiedDay[], today: ISODate, raceDate: ISODate, planStartDate: ISODate): ISODate | null {
  const earliestPlannedStart = inst.deferralRequested ? addDays(inst.plannedDate, 1) : inst.plannedDate
  const from = laterOf(today, earliestPlannedStart)
  const days = candidateDaysForWeek(planStartDate, inst.weekNumber, from, raceDate)
  return firstEligibleDay(days, inst.recoveryTags, occupied, raceDate)
}

/** Step 9's single escalation for `important`/`essential`: the following
 * plan week, tried exactly once.
 *
 * Scans from `max(today, that week's Monday)`, exactly as `attemptOwnWeek` does.
 * It previously started unconditionally at the Monday, which let the escalation
 * place a session on a date that had already gone: a plan week entirely in the
 * past would fail `attemptOwnWeek` (which does respect `today`) and then land
 * here on, say, last Tuesday — `upcoming` for ever, on a day that cannot be
 * trained and will never come round again. A week wholly in the past now yields
 * no candidate and the session drops, which is the honest outcome. */
function attemptFollowingWeek(inst: OpenInstance, occupied: OccupiedDay[], today: ISODate, raceDate: ISODate, planStartDate: ISODate): ISODate | null {
  const nextWeekNumber = inst.weekNumber + 1
  const nextWeekMonday = addDays(planStartDate, (nextWeekNumber - 1) * DAYS_PER_WEEK)
  const days = candidateDaysForWeek(planStartDate, nextWeekNumber, laterOf(today, nextWeekMonday), raceDate)
  return firstEligibleDay(days, inst.recoveryTags, occupied, raceDate)
}

/**
 * A total order over open instances: `essential` before `important` before
 * `optional` (`PRIORITY_TIER_RANK`), then the existing `(weekNumber,
 * sequenceInWeek)` ordering within a tier, then `templateId` as a final,
 * data-derived tiebreaker so the result can never depend on input array
 * position. Placing strictly by tier — every essential decided, in full,
 * before any important is even attempted, and every important before any
 * optional — is what makes the priority ladder's real guarantee hold
 * structurally rather than through a reactive, after-the-fact correction: a
 * lower-priority instance is never *decided*, and so can never claim a day,
 * while a higher-priority one still has an undecided fate. That is what
 * "essential sessions move first" actually protects against — a
 * lower-priority session crowding an essential out of a day the essential
 * could have used. It deliberately does *not* mean an essential dropping
 * forces every lower-priority same-week peer to drop too: when an essential
 * fails, it is because its own week and its one following-week escalation
 * were exhausted by frozen history, pins, or other essentials — none of
 * which a same-week peer's placement caused or could undo by yielding.
 */
function byPriorityTier(a: OpenInstance, b: OpenInstance): number {
  const rankDiff = PRIORITY_TIER_RANK[a.priority] - PRIORITY_TIER_RANK[b.priority]
  if (rankDiff !== 0) return rankDiff
  if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber
  if (a.sequenceInWeek !== b.sequenceInWeek) return a.sequenceInWeek - b.sequenceInWeek
  if (a.templateId === b.templateId) return 0
  return a.templateId < b.templateId ? -1 : 1
}

/**
 * Places every open (non-frozen, non-pinned) instance, re-sorted internally
 * by `byPriorityTier` regardless of the order `openInstances` arrives in —
 * every essential is decided before any important is attempted, and every
 * important before any optional, which is what prevents a lower-priority
 * session from ever crowding an essential out of a day it needed (see
 * `byPriorityTier`) without a reactive "bump a lower-priority session"
 * correction. Within a tier, the existing `(weekNumber, sequenceInWeek)`
 * order is what makes the "no double-workout catch-up" behaviour fall out
 * naturally: each instance claims a day before the next one *in its tier* is
 * even considered, so two open instances of the same priority can never race
 * for the same date regardless of how far behind the plan is.
 *
 * `initialOccupied` (frozen instances plus pinned overrides) is copied, not
 * mutated, and grows by one entry each time an instance is placed.
 */
export function placeOpenInstances(
  openInstances: OpenInstance[],
  initialOccupied: OccupiedDay[],
  today: ISODate,
  raceDate: ISODate,
  planStartDate: ISODate,
): Map<string, PlacementOutcome> {
  const occupied: OccupiedDay[] = initialOccupied.map((o) => ({ ...o, tags: [...o.tags] }))
  const placements = new Map<string, PlacementOutcome>()
  const sorted = [...openInstances].sort(byPriorityTier)

  const place = (inst: OpenInstance, day: ISODate): void => {
    occupied.push({ date: day, tags: [...inst.recoveryTags] })
    let explanation: string | null = null
    if (inst.deferralRequested) {
      explanation = deferredExplanation(inst.name, day)
    } else if (compareDates(day, inst.plannedDate) !== 0) {
      // A backdated completion (COMPLETE_EARLIER) that occupies this
      // instance's planned date is a different cause than an ordinary missed
      // day, and gets its own, causally-accurate copy rather than the
      // generic "was missed" phrasing (Finding 4).
      const backdatedOccupant = occupied.find((o) => o.date === inst.plannedDate && o.backdatedName !== undefined)
      explanation = backdatedOccupant?.backdatedName !== undefined
        ? backdatedExplanation(inst.name, backdatedOccupant.backdatedName)
        : movedExplanation(inst.name, day, `${weekdayName(inst.plannedDate)} was missed`)
    }
    placements.set(inst.templateId, { scheduledDate: day, explanation, dropped: null })
  }

  const drop = (inst: OpenInstance): void => {
    placements.set(inst.templateId, {
      scheduledDate: null,
      explanation: droppedExplanation(inst.name, inst.priority, 'preserve recovery'),
      dropped: { templateId: inst.templateId, priority: inst.priority, reason: 'No eligible day remained for this session before the plan needed to move on.' },
    })
  }

  for (const inst of sorted) {
    const ownWeek = attemptOwnWeek(inst, occupied, today, raceDate, planStartDate)
    if (ownWeek !== null) {
      place(inst, ownWeek)
      continue
    }

    if (inst.priority === 'optional') {
      drop(inst)
      continue
    }

    const followingWeek = attemptFollowingWeek(inst, occupied, today, raceDate, planStartDate)
    if (followingWeek !== null) {
      place(inst, followingWeek)
      continue
    }

    // `important` and `essential` are now symmetric here: both get exactly
    // one following-week escalation, then drop. The only thing that gives
    // essentials priority is *processing order* (they are fully decided
    // first, per `byPriorityTier`) — an essential's drop is never "corrected"
    // by also dropping a same-week lower-priority peer, because doing so
    // would only help when that peer was genuinely occupying a day the
    // essential could otherwise have used, which tier ordering already
    // guarantees can never happen (no lower-priority instance is ever
    // decided while an essential's fate is still open). When an essential
    // drops anyway, it is because its own week and the following week were
    // exhausted by *frozen history, pins, or other essentials* — none of
    // which a same-week lower-priority peer's drop could ever undo.
    drop(inst)
  }

  return placements
}
