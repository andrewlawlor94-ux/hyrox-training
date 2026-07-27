import type { ISODate, Priority } from '@/domain/types'
import { daysBetween } from '@/domain/dates'
import { DAYS_PER_WEEK } from './constants'

/**
 * Pure, locale-free copy builders for queue explanations. `toLocaleDateString`
 * is deliberately avoided (locale- and environment-dependent, would make
 * tests flaky) — dates are rendered by indexing these two fixed arrays from
 * the ISO date string itself, never through the platform's `Date` formatting.
 *
 * Tone rule enforced by a project-wide test: no guilt, no streaks, no
 * punitive language. Plain narration of what happened ("Tuesday was missed")
 * is fine; blame-coded phrasing ("you failed", "fell behind", "should have")
 * is not.
 */
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const MONTH_ABBREVIATIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** A fixed, arbitrary Monday used only as an arithmetic anchor for weekday
 * lookup (verified: 2001-01-01 was a Monday). Never displayed; never read as
 * a real calendar reference. Using `daysBetween` from the shared date module
 * keeps this pure and clock-free, per the domain purity rule. */
const WEEKDAY_ANCHOR_MONDAY: ISODate = '2001-01-01'

/** 'Monday'..'Sunday' for any ISO date, UTC, pure — no `toLocaleDateString`. */
export function weekdayName(date: ISODate): string {
  const offset = ((daysBetween(WEEKDAY_ANCHOR_MONDAY, date) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK
  return WEEKDAY_NAMES[offset] ?? 'Monday'
}

/** e.g. '6 Aug' — day-of-month without a leading zero, plus month
 * abbreviation. Parsed directly from the ISO string, no `Date` formatting. */
export function shortDate(date: ISODate): string {
  const [, month, day] = date.split('-')
  const monthIndex = Number(month) - 1
  const dayNumber = Number(day)
  return `${String(dayNumber)} ${MONTH_ABBREVIATIONS[monthIndex] ?? ''}`
}

/** e.g. 'Quality run moved to Thursday 6 Aug because Tuesday was missed.' */
export function movedExplanation(name: string, toDate: ISODate, cause: string): string {
  return `${name} moved to ${weekdayName(toDate)} ${shortDate(toDate)} because ${cause}.`
}

/** e.g. 'Optional Zone 2 session dropped to preserve recovery.' Priority is
 * capitalized so the sentence reads naturally as a subject. */
export function droppedExplanation(name: string, priority: Priority, cause: string): string {
  const label = priority.charAt(0).toUpperCase() + priority.slice(1)
  return `${label} ${name} session dropped to ${cause}.`
}

/** e.g. 'Strength A + sled deferred to Tuesday 4 Aug.' */
export function deferredExplanation(name: string, toDate: ISODate): string {
  return `${name} deferred to ${weekdayName(toDate)} ${shortDate(toDate)}.`
}

/** e.g. 'Strength A moved after your backdated Tuesday run was recorded.' */
export function backdatedExplanation(name: string, movedName: string): string {
  return `${name} moved after your backdated ${movedName} was recorded.`
}

/** e.g. 'The requested date for Strength B + stations could not be honoured
 * because another session already occupies it; it was placed automatically
 * instead.' Used when a pinned override collides with a day that is already
 * occupied (a frozen instance or a higher-precedence pin), so the schedule
 * never double-books a date. */
export function pinNotHonoredExplanation(name: string): string {
  return `The requested date for ${name} could not be honoured because another session already occupies it; it was placed automatically instead.`
}

/** Joins two already-punctuated sentences so the seam reads unambiguously as
 * two sentences rather than a run-on — trims incidental whitespace at each
 * end and inserts exactly one separating space. Used when prepending one
 * causal explanation (e.g. why a pin was not honoured) to another (why the
 * automated placement search landed where it did), so the combined copy
 * never depends on the first sentence happening to already end cleanly. */
export function joinSentences(first: string, second: string): string {
  return `${first.trim()} ${second.trim()}`
}
