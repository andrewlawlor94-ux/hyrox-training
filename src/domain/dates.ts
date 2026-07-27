import type { ISODate } from '@/domain/types'

/** ISO date fields (YYYY-MM-DD) always render month and day as two digits. */
const ISO_DATE_FIELD_WIDTH = 2
/** ISO week numbering: Monday = 1 .. Sunday = 7 (vs. JS's native Sunday = 0). */
const ISO_MONDAY = 1
/** Days in a calendar week — used for the Monday-start ISO week boundary. */
const DAYS_PER_WEEK = 7
/** Milliseconds in a day — used to convert a `Date` delta into whole days. */
const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const MS_PER_DAY = MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY

/**
 * Shared pure ISO-date arithmetic for the whole domain layer. String in,
 * string out, UTC throughout, never reads the ambient clock (an argless
 * `Date` constructor call is banned by the domain purity lint rule and the
 * filesystem-scanning purity test) — every `Date` constructed here is fed
 * from a caller-supplied ISODate.
 *
 * Task 7's `strengthTarget.ts` keeps its own private, near-identical date
 * helpers (`previousWeekRange` and friends) rather than importing this
 * module. That is intentional and out of this module's scope: Task 7's
 * tests were verified against that private implementation, and
 * consolidating it onto this module is a separate, later change.
 */

function parseISODateParts(date: ISODate): [number, number, number] {
  const parts = date.split('-').map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

function toUTCDate(date: ISODate): Date {
  const [year, month, day] = parseISODateParts(date)
  return new Date(Date.UTC(year, month - 1, day))
}

function toISODateString(date: Date): ISODate {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(ISO_DATE_FIELD_WIDTH, '0')
  const day = String(date.getUTCDate()).padStart(ISO_DATE_FIELD_WIDTH, '0')
  return `${year}-${month}-${day}`
}

/** Adds (or, for a negative count, subtracts) whole days to an ISO date. */
export function addDays(date: ISODate, days: number): ISODate {
  const result = toUTCDate(date)
  result.setUTCDate(result.getUTCDate() + days)
  return toISODateString(result)
}

/** Whole days from `from` to `to`. Positive when `to` is later, negative when
 * earlier, zero when equal. */
export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUTCDate(to).getTime() - toUTCDate(from).getTime()) / MS_PER_DAY)
}

/** -1, 0, or 1 comparing two ISO dates chronologically. ISO dates already
 * compare correctly as plain strings, but this makes the intent explicit at
 * call sites (e.g. `.sort(compareDates)`). */
export function compareDates(a: ISODate, b: ISODate): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** The Monday that starts the ISO week containing `date`. Sunday belongs to
 * the week that is ending, not the one about to start, so it maps back to
 * the *previous* Monday — not forward. */
export function startOfIsoWeek(date: ISODate): ISODate {
  const d = toUTCDate(date)
  const isoDayOfWeek = ((d.getUTCDay() + DAYS_PER_WEEK - ISO_MONDAY) % DAYS_PER_WEEK) + ISO_MONDAY
  return addDays(date, ISO_MONDAY - isoDayOfWeek)
}
