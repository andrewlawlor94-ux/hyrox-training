import { formatDuration, formatPace } from '@/domain/units/format'

/**
 * Y-axis tick for a pace chart: `380` reads as `6:20`.
 *
 * A pace is a duration, and nobody reading a training chart thinks in seconds
 * per kilometre — the athlete said so directly about the Progress tab. The
 * underlying datum stays a number so Recharts can still scale the axis; only
 * what is printed changes.
 *
 * No `/km` suffix here: it would be repeated down the whole axis, and the chart
 * heading and tooltip already carry the unit.
 */
export function paceTick(value: number): string {
  return formatDuration(value)
}

/**
 * Tooltip value for a pace chart, with the unit — `6:20/km`.
 *
 * Recharts hands the value through as its own loose `ValueType`, so a non-number
 * is passed through as text rather than coerced into a nonsense duration.
 */
export function paceTooltipValue(value: unknown): string {
  return typeof value === 'number' ? formatPace(value) : String(value)
}
