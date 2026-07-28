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
 *
 * - **Base**: one strength-maintenance session isn't yet the rule (strength
 *   is still full-volume) -- essential is the easy run, quality run, and
 *   both strength sessions; slot 6 (long run) is `important`.
 * - **Build**: the progressive long run/hybrid session is essential (this is
 *   where race-specific conditioning is actually being built); the easy run
 *   is `important`.
 * - **Race-specific and Specific prep** (corrected by controller audit
 *   against the source brief): the per-phase essential list is *one*
 *   strength-maintenance session (slot 1), the quality run, the easy run,
 *   and the hybrid/race-specific session (slot 6) -- NOT two strength
 *   sessions. Strength is deliberately reduced to maintenance dosing in this
 *   phase precisely so slot 5 (Strength B) can be the one that's expendable
 *   under compression, not the easy run. The easy run carries the three
 *   lower-leg durability exercises (straight-knee calf raise, bent-knee calf
 *   raise, tibialis raise) that the whole plan's shin-durability strategy
 *   depends on -- for an athlete whose limiter is running durability and
 *   whose main injury risk is shin symptoms, that session must never be the
 *   one sacrificed to protect a second strength day. Station exposure is
 *   still guaranteed regardless, since slot 6 (hybrid/simulation) is itself
 *   essential.
 * - **Taper** (same correction): essential is the key race-paced session
 *   (quality run), the easy aerobic session, the light strength/technique
 *   session (slot 1), and the race/race-preparation session (slot 6, e.g.
 *   week 23's "Light station technique"). Slot 5 -- a second strength
 *   session the brief doesn't list at all this late -- is `important`.
 *
 * This mapping was originally guessed as slot-6-essential across the board
 * (matching Build) for every non-Base/Taper phase; a controller audit against
 * the source brief corrected Race-specific, Specific prep, and Taper to the
 * one-strength-session shape above. See the Task 15 report for the audit.
 */
export const PHASE_TYPICAL_PRIORITY: Readonly<Record<string, { essentialSlots: readonly number[]; importantSlot: number }>> = {
  Base: { essentialSlots: [1, 2, 4, 5], importantSlot: 6 },
  Build: { essentialSlots: [1, 4, 5, 6], importantSlot: 2 },
  'Race-specific': { essentialSlots: [1, 2, 4, 6], importantSlot: 5 },
  'Specific prep': { essentialSlots: [1, 2, 4, 6], importantSlot: 5 },
  Taper: { essentialSlots: [1, 2, 4, 6], importantSlot: 5 },
}

/** Slot 3 (Zone 2) is always optional -- never part of the essential/important split above. */
export const ZONE2_SLOT = 3
