/** Seconds in an hour, used to convert a km/duration ratio into km/h. */
const SEC_PER_HOUR = 3600

/**
 * Exported so every place that needs to know "is this a real, loggable
 * value" — not just "is it present" — shares one definition rather than
 * each re-deriving its own (a mismatch between them is exactly how a zero or
 * negative value slips past one check but not another). `RunBlock` uses this
 * directly to decide whether a run is loggable at all, independent of
 * whether it also calls `paceSecPerKm` itself.
 */
export function isPositiveFinite(n: number): boolean {
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
