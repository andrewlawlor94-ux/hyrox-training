import type { ISODate, Priority, RecoveryTag } from '@/domain/types'
import { addDays, compareDates } from '@/domain/dates'
import type { OccupiedDay } from './eligibility'
import { isDayEligible } from './eligibility'
import { deferredExplanation, droppedExplanation, movedExplanation, weekdayName } from './explain'
import { AUTOMATED_PLACEMENT_WEEKDAYS_PER_WEEK, BUMP_PRIORITY_ORDER, DAYS_PER_WEEK } from './constants'

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
 * plan week, tried exactly once. */
function attemptFollowingWeek(inst: OpenInstance, occupied: OccupiedDay[], raceDate: ISODate, planStartDate: ISODate): ISODate | null {
  const nextWeekNumber = inst.weekNumber + 1
  const nextWeekMonday = addDays(planStartDate, (nextWeekNumber - 1) * DAYS_PER_WEEK)
  const days = candidateDaysForWeek(planStartDate, nextWeekNumber, nextWeekMonday, raceDate)
  return firstEligibleDay(days, inst.recoveryTags, occupied, raceDate)
}

/** Frees up room for a still-unplaced `essential` by dropping the lowest
 * priority session already scheduled this week (optional before important,
 * per `BUMP_PRIORITY_ORDER`). Mutates `occupied` and `placements` in place.
 * Returns whether a session was actually freed. */
function bumpLowestPriorityInWeek(
  weekNumber: number,
  openInstances: OpenInstance[],
  placements: Map<string, PlacementOutcome>,
  occupied: OccupiedDay[],
): boolean {
  for (const priority of BUMP_PRIORITY_ORDER) {
    const candidate = openInstances.find((i) => {
      if (i.weekNumber !== weekNumber || i.priority !== priority) return false
      const placed = placements.get(i.templateId)
      return placed !== undefined && placed.scheduledDate !== null
    })
    if (candidate === undefined) continue

    const placed = placements.get(candidate.templateId)
    const scheduledDate = placed?.scheduledDate ?? null
    if (scheduledDate !== null) {
      const idx = occupied.findIndex((o) => o.date === scheduledDate)
      if (idx !== -1) occupied.splice(idx, 1)
    }
    placements.set(candidate.templateId, {
      scheduledDate: null,
      explanation: droppedExplanation(candidate.name, candidate.priority, 'make room for an essential session this week'),
      dropped: { templateId: candidate.templateId, priority: candidate.priority, reason: 'Made room for an essential session this week.' },
    })
    return true
  }
  return false
}

/**
 * Places every open (non-frozen, non-pinned) instance in the order given —
 * callers must pass instances already sorted by (weekNumber,
 * sequenceInWeek), which is what makes the "no double-workout catch-up"
 * behaviour fall out naturally: each instance claims a day before the next
 * one is even considered, so two open instances can never race for the same
 * date regardless of how far behind the plan is.
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
  const occupied: OccupiedDay[] = initialOccupied.map((o) => ({ date: o.date, tags: [...o.tags] }))
  const placements = new Map<string, PlacementOutcome>()

  const place = (inst: OpenInstance, day: ISODate): void => {
    occupied.push({ date: day, tags: [...inst.recoveryTags] })
    let explanation: string | null = null
    if (inst.deferralRequested) {
      explanation = deferredExplanation(inst.name, day)
    } else if (compareDates(day, inst.plannedDate) !== 0) {
      explanation = movedExplanation(inst.name, day, `${weekdayName(inst.plannedDate)} was missed`)
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

  for (const inst of openInstances) {
    const ownWeek = attemptOwnWeek(inst, occupied, today, raceDate, planStartDate)
    if (ownWeek !== null) {
      place(inst, ownWeek)
      continue
    }

    if (inst.priority === 'optional') {
      drop(inst)
      continue
    }

    const followingWeek = attemptFollowingWeek(inst, occupied, raceDate, planStartDate)
    if (followingWeek !== null) {
      place(inst, followingWeek)
      continue
    }

    if (inst.priority === 'important') {
      drop(inst)
      continue
    }

    // essential: bump this week's lowest-priority scheduled session and retry once.
    const freedRoom = bumpLowestPriorityInWeek(inst.weekNumber, openInstances, placements, occupied)
    const retryDay = freedRoom
      ? attemptOwnWeek(inst, occupied, today, raceDate, planStartDate) ?? attemptFollowingWeek(inst, occupied, raceDate, planStartDate)
      : null
    if (retryDay !== null) {
      place(inst, retryDay)
    } else {
      drop(inst)
    }
  }

  return placements
}
