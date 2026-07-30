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

/**
 * Parses a workout DURATION into whole seconds: 'MM:SS', 'H:MM:SS', or a bare
 * number of minutes. Returns `null` for anything else.
 *
 * Deliberately NOT `parseRaceTime`, whose two-part form resolves to H:MM below
 * `TWO_PART_HOUR_THRESHOLD` — correct for a race clock, wrong here: an athlete
 * typing '28:30' for a run means 28 minutes 30 seconds, never 28 hours 30
 * minutes. Two parts are therefore ALWAYS MM:SS.
 *
 * A bare number is read as MINUTES ('45' -> 45 min), because that is how a
 * prescribed run is written and spoken ("45 minute easy run"). Seconds are not
 * range-checked: '2:90' is accepted as 3 min 30 s rather than rejected, since
 * the athlete's intent is unambiguous and refusing it would be pedantry.
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
  const [minutes] = nums as [number]
  return minutes * SEC_PER_MIN
}
