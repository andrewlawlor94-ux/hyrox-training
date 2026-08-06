import type { Load, Unit } from '@/domain/types'
import { convertLoad } from './convert'

/** Default decimal precision for a displayed load, e.g. '22.5 kg'. */
export const DEFAULT_LOAD_DECIMALS = 1
/** Fallback label for a custom load with no `customUnitLabel` set. */
export const DEFAULT_CUSTOM_UNIT_LABEL = 'units'
/** The cross-unit equivalent shown by formatWithEquivalent is approximate,
 * so it is rounded to a whole number rather than shown with decimals. */
export const EQUIVALENT_ROUND_DECIMALS = 0
/** Middle dot (U+00B7) separating a load from its converted equivalent. */
export const EQUIVALENT_SEPARATOR = ' · '
/** Em dash (U+2014) — the placeholder rendered for a pace that cannot be
 * computed yet (e.g. a half-entered run), instead of 'NaN/km'. */
export const EM_DASH = '—'

/** Seconds in a minute. */
export const SEC_PER_MIN = 60
/** Seconds in an hour. */
export const SEC_PER_HOUR = 3600
/** Metres in a kilometre — the threshold above which formatDistanceM
 * switches from metres to kilometres. */
export const M_PER_KM = 1000
/** Decimal precision for a displayed kilometre distance, e.g. '1.5 km'. */
export const DISTANCE_KM_DECIMALS = 1
/** Clock-style fields (minutes, seconds) are always zero-padded to two
 * digits, e.g. '1:02:30'. */
export const CLOCK_FIELD_PAD_WIDTH = 2

/**
 * A two-part race time input ('A:B') is genuinely ambiguous between H:MM and
 * MM:SS — both share the same shape. We default to H:MM, the common case
 * for a race target under a day (e.g. '1:35' -> 1 h 35 m). A first number
 * above this threshold cannot plausibly be an hour count, so it is read
 * instead as MM:SS (e.g. '95:00' -> 95 min, not 95 h). 59 is the largest
 * plausible hour count for a race clock.
 */
export const TWO_PART_HOUR_THRESHOLD = 59
/** H:MM:SS has at most three colon-separated parts; more than that is
 * rejected as junk input. */
export const RACE_TIME_MAX_PARTS = 3

function trimNumber(value: number, decimals: number): string {
  return Number.parseFloat(value.toFixed(decimals)).toString()
}

function padClockField(n: number): string {
  return String(n).padStart(CLOCK_FIELD_PAD_WIDTH, '0')
}

export function formatLoad(load: Load, opts?: { decimals?: number }): string {
  const decimals = opts?.decimals ?? DEFAULT_LOAD_DECIMALS
  const label = load.unit === 'custom' ? (load.customUnitLabel ?? DEFAULT_CUSTOM_UNIT_LABEL) : load.unit
  return `${trimNumber(load.value, decimals)} ${label}`
}

/**
 * Renders a load alongside its approximate equivalent in the other unit,
 * e.g. '152 kg · ~335 lb'. A `custom` unit has no meaningful equivalent, so
 * it renders as `formatLoad` alone.
 */
export function formatWithEquivalent(load: Load): string {
  if (load.unit === 'custom') return formatLoad(load)
  const equivalentUnit: Unit = load.unit === 'kg' ? 'lb' : 'kg'
  const converted = convertLoad(load, equivalentUnit)
  const equivalent = trimNumber(converted.value, EQUIVALENT_ROUND_DECIMALS)
  return `${formatLoad(load)}${EQUIVALENT_SEPARATOR}~${equivalent} ${equivalentUnit}`
}

/** Formats a duration as 'M:SS', 'MM:SS', or 'H:MM:SS', omitting the hour
 * component entirely when there isn't one. */
export function formatDuration(totalSec: number): string {
  const hours = Math.floor(totalSec / SEC_PER_HOUR)
  const remainderSec = totalSec % SEC_PER_HOUR
  const minutes = Math.floor(remainderSec / SEC_PER_MIN)
  const seconds = Math.floor(remainderSec % SEC_PER_MIN)
  const paddedSeconds = padClockField(seconds)
  if (hours > 0) return `${hours}:${padClockField(minutes)}:${paddedSeconds}`
  return `${minutes}:${paddedSeconds}`
}

/** Renders a pace in sec/km, or the em dash placeholder for `null` rather
 * than letting a half-entered run reach the display as 'NaN/km'. */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null) return EM_DASH
  return `${formatDuration(secPerKm)}/km`
}

export function formatDistanceM(m: number): string {
  if (m < M_PER_KM) return `${m} m`
  return `${trimNumber(m / M_PER_KM, DISTANCE_KM_DECIMALS)} km`
}

/** Always renders the full H:MM:SS form, unlike `formatDuration`. */
export function formatRaceTime(totalSec: number): string {
  const hours = Math.floor(totalSec / SEC_PER_HOUR)
  const remainderSec = totalSec % SEC_PER_HOUR
  const minutes = Math.floor(remainderSec / SEC_PER_MIN)
  const seconds = Math.floor(remainderSec % SEC_PER_MIN)
  return `${hours}:${padClockField(minutes)}:${padClockField(seconds)}`
}

function isValidTimePart(part: string): boolean {
  return /^\d+$/.test(part)
}

/**
 * Parses 'H:MM:SS', 'H:MM', or 'MM:SS' into whole seconds, or `null` for
 * anything that isn't one of those shapes. See TWO_PART_HOUR_THRESHOLD for
 * how the two-part H:MM vs MM:SS ambiguity is resolved.
 */
export function parseRaceTime(text: string): number | null {
  const parts = text.trim().split(':')
  if (parts.length < 2 || parts.length > RACE_TIME_MAX_PARTS) return null
  if (parts.some((p) => !isValidTimePart(p))) return null
  const nums = parts.map((p) => Number.parseInt(p, 10))

  if (nums.length === RACE_TIME_MAX_PARTS) {
    const [h, m, s] = nums as [number, number, number]
    return h * SEC_PER_HOUR + m * SEC_PER_MIN + s
  }

  const [a, b] = nums as [number, number]
  if (a > TWO_PART_HOUR_THRESHOLD) return a * SEC_PER_MIN + b
  return a * SEC_PER_HOUR + b * SEC_PER_MIN
}

/** Digits a clock entry holds at most, H:MM:SS — two each for seconds,
 * minutes and hours. */
export const CLOCK_DIGITS_MAX = 6
/** Digits in one clock field (seconds, minutes). */
const CLOCK_DIGITS_PER_FIELD = 2

/**
 * Reads a bare run of digits as a clock entry, filling from the RIGHT: the last
 * two digits are seconds, the two before them minutes, the rest hours.
 * `'5'` -> 0:05, `'45'` -> 0:45, `'330'` -> 3:30, `'2830'` -> 28:30,
 * `'12345'` -> 1:23:45.
 *
 * This is how a stopwatch, a microwave and every timer app on a phone take a
 * time, and it is what the athlete asked for: "take the input as the first two
 * digits are minutes and second two are seconds". It replaces an earlier rule
 * where a bare number meant MINUTES, so `'45'` now means forty-five SECONDS
 * rather than forty-five minutes. That is only safe because `DurationField`
 * renders the interpretation live as the digits are typed — the athlete watches
 * `4` become `0:04` and `45` become `0:45`, so there is nothing left to guess.
 *
 * Anything that is not purely digits, or longer than `CLOCK_DIGITS_MAX`,
 * returns `null` rather than a silent truncation.
 *
 * Seconds and minutes are deliberately NOT range-checked: `'0090'` is 90
 * seconds, which normalises to 1:30. The intent is unambiguous.
 */
export function parseClockDigits(digits: string): number | null {
  if (digits === '' || !/^\d+$/.test(digits) || digits.length > CLOCK_DIGITS_MAX) return null
  const secondsPart = digits.slice(-CLOCK_DIGITS_PER_FIELD)
  const minutesPart = digits.slice(-CLOCK_DIGITS_PER_FIELD * 2, -CLOCK_DIGITS_PER_FIELD)
  const hoursPart = digits.slice(0, -CLOCK_DIGITS_PER_FIELD * 2)
  const seconds = Number.parseInt(secondsPart, 10)
  const minutes = minutesPart === '' ? 0 : Number.parseInt(minutesPart, 10)
  const hours = hoursPart === '' ? 0 : Number.parseInt(hoursPart, 10)
  return hours * SEC_PER_HOUR + minutes * SEC_PER_MIN + seconds
}

/** Leading zeros carry no information in a clock buffer — `'045'` and `'45'`
 * both mean 45 seconds — so they are stripped to keep the buffer canonical,
 * while never emptying it (`'000'` becomes `'0'`, which still shows 0:00). */
const LEADING_ZEROS = /^0+(?=\d)/

/** Strips a digit buffer to canonical form and caps it at `CLOCK_DIGITS_MAX`,
 * keeping the RIGHTMOST digits — a clock entry fills from the seconds end, so
 * the oldest digit is the one that falls off. */
export function normalizeClockDigits(raw: string): string {
  return raw.replace(/\D/g, '').replace(LEADING_ZEROS, '').slice(-CLOCK_DIGITS_MAX)
}

/** The digit string that `parseClockDigits` would read back as `totalSec` —
 * the inverse used to seed a masked field from a stored value. */
export function clockDigitsFrom(totalSec: number): string {
  return normalizeClockDigits(formatDuration(Math.max(0, Math.floor(totalSec))))
}

/**
 * Renders a digit buffer in clock shape WITHOUT normalising its value, so a
 * masked field can show what has been typed so far: `'2'` -> 0:02,
 * `'28'` -> 0:28, `'283'` -> 2:83, `'2830'` -> 28:30.
 *
 * The un-normalised middle state is the point. Formatting through
 * `parseClockDigits` instead would turn `'283'` (2 min 83 s) into `3:23`, whose
 * own digits are `'323'` — so the next keystroke, and every backspace, would
 * operate on digits the athlete never typed. Displaying the buffer directly
 * keeps typing and deleting exactly reversible.
 */
export function formatClockDigits(digits: string): string {
  if (digits === '') return ''
  const seconds = digits.slice(-CLOCK_DIGITS_PER_FIELD).padStart(CLOCK_DIGITS_PER_FIELD, '0')
  const minutesRaw = digits.slice(-CLOCK_DIGITS_PER_FIELD * 2, -CLOCK_DIGITS_PER_FIELD)
  const hoursRaw = digits.slice(0, -CLOCK_DIGITS_PER_FIELD * 2)
  const minutes = minutesRaw === '' ? '0' : String(Number.parseInt(minutesRaw, 10))
  if (hoursRaw === '') return `${minutes}:${seconds}`
  return `${String(Number.parseInt(hoursRaw, 10))}:${minutes.padStart(CLOCK_DIGITS_PER_FIELD, '0')}:${seconds}`
}

/**
 * Parses a workout DURATION into whole seconds: 'MM:SS', 'H:MM:SS', or a bare
 * run of digits read as a clock entry (see `parseClockDigits`). Returns `null`
 * for anything else.
 *
 * Deliberately NOT `parseRaceTime`, whose two-part form resolves to H:MM below
 * `TWO_PART_HOUR_THRESHOLD` — correct for a race clock, wrong here: an athlete
 * typing '28:30' for a run means 28 minutes 30 seconds, never 28 hours 30
 * minutes. Two parts are therefore ALWAYS MM:SS.
 *
 * Seconds are not range-checked: '2:90' is accepted as 3 min 30 s rather than
 * rejected, since the athlete's intent is unambiguous and refusing it would be
 * pedantry.
 */
export function parseDuration(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const parts = trimmed.split(':')
  if (parts.length > RACE_TIME_MAX_PARTS) return null
  if (parts.some((p) => !isValidTimePart(p))) return null
  const nums = parts.map((p) => Number.parseInt(p, 10))

  if (nums.length === RACE_TIME_MAX_PARTS) {
    const [h, m, s] = nums as [number, number, number]
    return h * SEC_PER_HOUR + m * SEC_PER_MIN + s
  }
  if (nums.length === 2) {
    const [m, s] = nums as [number, number]
    return m * SEC_PER_MIN + s
  }
  return parseClockDigits(trimmed)
}
