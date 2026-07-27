/** Seconds in an hour, used to convert a km/duration ratio into km/h. */
const SEC_PER_HOUR = 3600

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0
}

/**
 * Seconds per kilometre. Returns null — never NaN or Infinity — for any
 * non-positive or non-finite input, so callers can render a placeholder.
 * This runs on every keystroke while an athlete enters a run, so it is
 * routinely called with half-entered (zero or negative) values.
 */
export function paceSecPerKm(distanceKm: number, durationSec: number): number | null {
  if (!isPositiveFinite(distanceKm) || !isPositiveFinite(durationSec)) return null
  return durationSec / distanceKm
}

/** Average speed in km/h. Same null-safety contract as paceSecPerKm. */
export function speedKmh(distanceKm: number, durationSec: number): number | null {
  if (!isPositiveFinite(distanceKm) || !isPositiveFinite(durationSec)) return null
  return (distanceKm / durationSec) * SEC_PER_HOUR
}

/** Projects the time to cover a distance at a given pace. */
export function projectedTimeSec(distanceKm: number, paceSecPerKmValue: number): number | null {
  if (!isPositiveFinite(distanceKm) || !isPositiveFinite(paceSecPerKmValue)) return null
  return distanceKm * paceSecPerKmValue
}
