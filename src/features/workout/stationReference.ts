import type { HyroxStandard } from '@/data/types'
import { formatDistanceM, formatWithEquivalent } from '@/domain/units/format'

/**
 * Renders a `HyroxStandard` row as one reference line, e.g.
 * '50 m · 152 kg · ~335 lb'. Every field is read straight off the database
 * row — nothing here is a hard-coded competition number — so editing a
 * standard in place changes what this renders on the very next read.
 * Returns `undefined` when the exercise has no seeded standard at all (a
 * user-created "station-shaped" exercise), so callers can omit the
 * reference line entirely rather than showing an empty one.
 */
export function stationReferenceText(standard: HyroxStandard | undefined): string | undefined {
  if (!standard) return undefined
  const parts: string[] = []
  if (standard.distanceM !== undefined) parts.push(formatDistanceM(standard.distanceM))
  if (standard.loadKg !== undefined) parts.push(formatWithEquivalent({ value: standard.loadKg, unit: 'kg' }))
  if (standard.loadPerHandKg !== undefined) parts.push(`${formatWithEquivalent({ value: standard.loadPerHandKg, unit: 'kg' })} per hand`)
  if (standard.reps !== undefined) parts.push(`${String(standard.reps)} reps`)
  if (standard.ballKg !== undefined) parts.push(`${formatWithEquivalent({ value: standard.ballKg, unit: 'kg' })} ball`)
  if (standard.targetHeightM !== undefined) parts.push(`${String(standard.targetHeightM)} m target`)
  if (parts.length === 0) return undefined
  return parts.join(' · ')
}
