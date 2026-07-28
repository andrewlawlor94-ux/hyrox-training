import type { SeedPhase } from './types'

/**
 * The five training phases (§19), covering weeks 1-24 contiguously with no
 * overlap. Order matters: `phaseForWeek` walks this list front-to-back.
 */
export const SEED_PHASES: readonly SeedPhase[] = [
  {
    name: 'Base',
    weekStart: 1,
    weekEnd: 6,
    focus: 'Build easy-running frequency and lower-leg durability while retaining the existing strength base.',
  },
  {
    name: 'Build',
    weekStart: 7,
    weekEnd: 12,
    focus: 'Progressive running and hybrid volume, ending in a benchmark test of race-pace running under partial fatigue.',
  },
  {
    name: 'Race-specific',
    weekStart: 13,
    weekEnd: 18,
    focus: 'Race-pace and compromised running with rising station volume, culminating in the 75% full-format simulation.',
  },
  {
    name: 'Specific prep',
    weekStart: 19,
    weekEnd: 22,
    focus: 'Peak specificity -- transitions practice and the controlled full-format rehearsal -- then a reduced-volume consolidation.',
  },
  {
    name: 'Taper',
    weekStart: 23,
    weekEnd: 24,
    focus: 'Reduce volume while preserving race-pace sharpness through race day.',
  },
] as const

/** Looks up the phase covering a given week number (1..24). Throws on an
 * out-of-range week rather than silently returning a wrong phase. */
export function phaseForWeek(weekNumber: number): SeedPhase {
  const phase = SEED_PHASES.find((p) => weekNumber >= p.weekStart && weekNumber <= p.weekEnd)
  if (!phase) throw new Error(`No phase covers week ${String(weekNumber)}`)
  return phase
}

/**
 * D7: the four essential slots per phase, derived from §19's per-phase list.
 * Slot 3 (Zone 2) is always `optional` and is deliberately not listed here.
 * The `important` slot is whichever of {2, 6} is not essential that phase:
 *
 * - Base and Taper protect running *frequency* (the easy run, slot 2) as
 *   essential, since durability work rides on it and this is either the
 *   frequency-building phase or the pre-race durability-protection phase.
 * - Build, Race-specific, and Specific prep protect the higher-value
 *   specificity session (long run / hybrid / simulation, slot 6) as
 *   essential once race-specific conditioning is the point of the phase.
 *
 * This mapping is this implementation's own documented ruling (the source
 * brief's literal §19 per-phase list is not available in this repo) -- see
 * the Task 15 report for the full rationale.
 */
export const PHASE_TYPICAL_PRIORITY: Readonly<Record<string, { essentialSlots: readonly number[]; importantSlot: number }>> = {
  Base: { essentialSlots: [1, 2, 4, 5], importantSlot: 6 },
  Build: { essentialSlots: [1, 4, 5, 6], importantSlot: 2 },
  'Race-specific': { essentialSlots: [1, 4, 5, 6], importantSlot: 2 },
  'Specific prep': { essentialSlots: [1, 4, 5, 6], importantSlot: 2 },
  Taper: { essentialSlots: [1, 2, 4, 5], importantSlot: 6 },
}

/** Slot 3 (Zone 2) is always optional -- never part of the essential/important split above. */
export const ZONE2_SLOT = 3
