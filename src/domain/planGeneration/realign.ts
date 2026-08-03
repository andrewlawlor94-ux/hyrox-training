import type { ISODate } from '@/domain/types'
import { addDays, compareDates, daysBetween, startOfIsoWeek } from '@/domain/dates'
import { PLAN_WEEKS_DEFAULT } from './constants'

/** Calendar days in one plan week. */
const DAYS_PER_WEEK = 7
/** A plan always has at least one core week — a race this week still gets a
 * race week. */
const MIN_CORE_WEEKS = 1
/** `lastHistoryWeek` when nothing has been trained yet. */
const NO_HISTORY = 0

/**
 * What became of one planned session, reduced to the only three distinctions
 * that matter when working out where the athlete actually is.
 *
 * `attended` is the only outcome that counts as progress through the plan.
 * `settled` — skipped, or auto-dropped to protect recovery — is a decision
 * already made and not coming back, so it neither counts as progress nor holds
 * its week open. `outstanding` is work still genuinely to come.
 *
 * Auto-drops count as settled deliberately. Treating them as outstanding would
 * make the resume week depend on placement results that a realign then changes,
 * so realigning twice could give two different answers; and the priority ladder
 * already means a dropped session is one the plan decided to do without.
 */
export type SessionOutcome = 'attended' | 'settled' | 'outstanding'

export interface HistoricalSession {
  weekNumber: number
  outcome: SessionOutcome
}

/**
 * The plan week the athlete should be training NOW, read off what they have
 * actually done rather than off the calendar.
 *
 * This is the whole point of a realign: the calendar marches on whether or not
 * anyone trains, so a plan whose week number is derived purely from its start
 * date can claim you are in week 12 when you have completed three weeks of
 * work. History is the honest answer.
 *
 * - Nothing attended at all -> week 1. There is no progress to preserve, so the
 *   plan resumes from its beginning.
 * - Otherwise the LAST week with an attended session, if that week still has
 *   outstanding sessions — you are mid-week, not finished with it.
 * - Otherwise the week after it.
 *
 * The last *attended* week, not the last week touched: weeks that were entirely
 * skipped or dropped are not progress, and treating them as such would push the
 * athlete forward past training they never did.
 *
 * Pure: no clock, no I/O.
 */
export function resumeWeekFromHistory(sessions: readonly HistoricalSession[]): number {
  let lastAttended = NO_HISTORY
  for (const session of sessions) {
    if (session.outcome === 'attended' && session.weekNumber > lastAttended) lastAttended = session.weekNumber
  }
  if (lastAttended === NO_HISTORY) return 1

  const weekHasOutstanding = sessions.some((s) => s.weekNumber === lastAttended && s.outcome === 'outstanding')
  return weekHasOutstanding ? lastAttended : lastAttended + 1
}

export type RealignOutcome =
  /** The plan's dates and length both change so the resume week starts today. */
  | 'realigned'
  /** The resume week already starts this week and the plan already ends on race
   * week — only stale pins and manual moves are cleared. */
  | 'alreadyAligned'
  /** Race day is behind us: there is no runway to align to. Nothing changes. */
  | 'raceInPast'

export interface RealignDecision {
  outcome: RealignOutcome
  /** The plan week that will start this week. */
  resumeWeek: number
  /** What history asked for, before the plan's own length limits clamped it.
   * Equal to `resumeWeek` in the ordinary case. */
  requestedResumeWeek: number
  startDate: ISODate
  coreWeeks: number
  /** Generated Base ("Prologue") weeks the plan should carry. Trimmed BEFORE any
   * core week is given up — see `realignPlanToToday`. */
  baseWeeks: number
  /** Total weeks the plan will run (base + core). */
  totalWeeks: number
  /** True when the plan's WEEK MAKEUP changes, which means its future content
   * has to be regenerated — and so any hand-edits to not-yet-started sessions
   * are lost. Callers warn on this; it is the one genuinely destructive part of
   * a realign. A realign that only moves dates leaves every row in place. */
  requiresRegeneration: boolean
  /** Athlete-facing sentence. Always populated. */
  explanation: string
}

/** Weeks from one Monday to another, counting both ends. */
function weeksInclusive(fromMonday: ISODate, toMonday: ISODate): number {
  return daysBetween(fromMonday, toMonday) / DAYS_PER_WEEK + 1
}

/**
 * Re-lays the plan out so the week the athlete actually reached starts TODAY,
 * while its final week is still race week.
 *
 * The athlete's own words for the problem: "Sometimes schedule gets too out of
 * wack and needs to be aligned. Look at history and start today."
 *
 * How it differs from `reanchorToRaceDate`, which it deliberately does not
 * replace: that one reacts to a CHANGED RACE DATE and holds the plan's position
 * fixed, so it only ever moves the start later. This one reacts to a DRIFTED
 * ATHLETE and holds race week fixed, so it will move the start in either
 * direction — earlier when they are ahead, later when they are behind. Moving a
 * start earlier does drag whole weeks into the past where their sessions get
 * dropped, and here that is the intended result, not a hazard: those are weeks
 * the athlete has already finished or already missed.
 *
 * The start is derived BACKWARDS from race week rather than forwards from
 * today, exactly as `anchorPlan` does, which is what guarantees the taper still
 * lands on race week however far the plan had drifted.
 *
 * When the plan has to get shorter, the generated Base ("Prologue") weeks are
 * given up FIRST and the 24-week core block only once they are gone. They are
 * gap-filler that `anchorPlan` invents purely so the athlete trains today
 * instead of waiting, whereas a core week is a week of the actual programme —
 * cutting programme weeks to protect filler is backwards. Caught in the browser:
 * a plan with a three-week prologue and 24 core weeks was proposing to drop a
 * core week and keep all three prologue weeks.
 *
 * Pure: `today` is a parameter, no clock is read.
 */
export function realignPlanToToday(args: {
  today: ISODate
  raceDate: ISODate
  currentStartDate: ISODate
  /** Generated Base ("Prologue") weeks the plan currently has. */
  baseWeeks: number
  currentCoreWeeks: number
  /** Where history reaches — `resumeWeekFromHistory`'s answer. */
  resumeWeek: number
  /** The highest week number carrying any history at all (completed, or
   * in-progress with logged work). The plan must never end before it, or a week
   * holding real training would fall outside the plan's own length. `0` when
   * there is no history. */
  lastHistoryWeek: number
}): RealignDecision {
  const { today, raceDate, currentStartDate, baseWeeks, currentCoreWeeks, resumeWeek, lastHistoryWeek } = args
  const thisMonday = startOfIsoWeek(today)
  const raceMonday = startOfIsoWeek(raceDate)
  const weeksToRace = weeksInclusive(thisMonday, raceMonday)

  if (weeksToRace < MIN_CORE_WEEKS) {
    return {
      outcome: 'raceInPast',
      resumeWeek, requestedResumeWeek: resumeWeek,
      startDate: currentStartDate,
      coreWeeks: currentCoreWeeks,
      baseWeeks,
      totalWeeks: baseWeeks + currentCoreWeeks,
      requiresRegeneration: false,
      explanation: `Race day (${raceDate}) has already gone, so there is no runway to line the plan up against. Set a new race date in Settings first, then realign.`,
    }
  }

  // The plan needs the weeks already behind the resume point, plus every week
  // from this one through race week.
  const desiredTotal = (resumeWeek - 1) + weeksToRace
  const maxTotal = baseWeeks + PLAN_WEEKS_DEFAULT
  const minTotal = Math.max(MIN_CORE_WEEKS, lastHistoryWeek)
  // `min` applied last so an impossible floor (a history week beyond what the
  // seed can generate) yields the longest plan available rather than an
  // over-long one.
  const totalWeeks = Math.min(maxTotal, Math.max(minTotal, desiredTotal))
  // Core weeks first, prologue with whatever is left over: the prologue is the
  // part that gives way when the plan has to shorten.
  const coreWeeks = Math.min(PLAN_WEEKS_DEFAULT, totalWeeks)
  const nextBaseWeeks = totalWeeks - coreWeeks
  const startDate = addDays(raceMonday, -DAYS_PER_WEEK * (totalWeeks - 1))
  // Where today lands once the clamp has had its say.
  const actualResumeWeek = totalWeeks - weeksToRace + 1

  const startMoved = compareDates(startDate, startOfIsoWeek(currentStartDate)) !== 0
  const coreChanged = coreWeeks !== currentCoreWeeks
  const baseChanged = nextBaseWeeks !== baseWeeks

  if (!startMoved && !coreChanged && !baseChanged) {
    return {
      outcome: 'alreadyAligned',
      resumeWeek: actualResumeWeek, requestedResumeWeek: resumeWeek,
      startDate: currentStartDate, coreWeeks, baseWeeks: nextBaseWeeks, totalWeeks,
      requiresRegeneration: false,
      explanation: `Week ${String(actualResumeWeek)} already starts this week and week ${String(totalWeeks)} already lands on race week, so no session dates change. Pinned moves and manual reschedules are cleared so nothing stale is left pulling sessions around.`,
    }
  }

  const clamped = actualResumeWeek !== resumeWeek
  const parts = [
    `Week ${String(actualResumeWeek)} now starts this week, and the plan runs ${String(totalWeeks)} weeks so week ${String(totalWeeks)} is race week.`,
  ]
  if (coreChanged) {
    parts.push(`Core weeks go from ${String(currentCoreWeeks)} to ${String(coreWeeks)}${coreWeeks < currentCoreWeeks ? ', keeping the sharpest weeks and the taper' : ''}.`)
  }
  if (baseChanged) {
    parts.push(nextBaseWeeks === 0
      ? `The ${String(baseWeeks)} prologue week${baseWeeks === 1 ? '' : 's'} ${baseWeeks === 1 ? 'goes' : 'go'}, because the core programme comes first.`
      : `The prologue goes from ${String(baseWeeks)} week${baseWeeks === 1 ? '' : 's'} to ${String(nextBaseWeeks)}, which is where the change is absorbed before any core week.`)
  }
  if (clamped) {
    parts.push(`History reaches week ${String(resumeWeek)}, but the plan cannot run longer than ${String(maxTotal)} weeks, so it resumes at week ${String(actualResumeWeek)} instead.`)
  }
  parts.push('Completed sessions keep the dates they were done on. Anything still outstanding in a week that is now behind you counts as missed.')

  return {
    outcome: 'realigned',
    resumeWeek: actualResumeWeek, requestedResumeWeek: resumeWeek,
    startDate, coreWeeks, baseWeeks: nextBaseWeeks, totalWeeks,
    requiresRegeneration: coreChanged || baseChanged,
    explanation: parts.join(' '),
  }
}
