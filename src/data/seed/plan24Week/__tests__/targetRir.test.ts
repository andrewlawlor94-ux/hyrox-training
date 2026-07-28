import { describe, expect, it } from 'vitest'
import { targetRirFor } from '../strengthTemplates'
import { SEED_WEEKS_24 } from '../index'
import type { SeedPrescription } from '../types'

/** The seeded compound/accessory strength-lift exercises that actually carry
 * a target RIR (§ target RIR fix): every `measurementType: 'strengthSets'`
 * exercise used in Strength A/B and the race-week technique template.
 * Deliberately excludes the lower-leg durability trio (calf raises, tibialis
 * raise) baked into every easy run -- that's rehab/prehab dosed for control,
 * not near-failure progression work, so a target RIR doesn't apply to it. */
const RIR_BEARING_EXERCISE_IDS = new Set([
  'ex_back_squat', 'ex_romanian_deadlift', 'ex_split_squat',
  'ex_bench_press', 'ex_lat_pulldown', 'ex_walking_lunge', 'ex_pallof_press',
])

/** The 8 HYROX station exercises never carry a target RIR -- their loads are
 * fixed by competition standard and never auto-progress off RIR. */
const STATION_EXERCISE_IDS = new Set([
  'ex_ski_erg', 'ex_sled_push', 'ex_sled_pull', 'ex_burpee_broad_jump',
  'ex_row', 'ex_farmer_carry', 'ex_sandbag_lunge', 'ex_wall_ball',
])

const allPrescriptions = (): SeedPrescription[] => SEED_WEEKS_24.flatMap((w) => w.templates.flatMap((t) => t.prescriptions))

describe('targetRirFor', () => {
  it('is conservative in Base (weeks 1-6): RIR 3 for both main lifts and accessories', () => {
    for (const week of [1, 3, 6]) {
      expect(targetRirFor(week, true)).toBe(3)
      expect(targetRirFor(week, false)).toBe(3)
    }
  })

  it('is moderate in Build (weeks 7-12): main lifts tighter than accessories', () => {
    for (const week of [7, 9, 12]) {
      expect(targetRirFor(week, true)).toBe(2)
      expect(targetRirFor(week, false)).toBe(3)
    }
  })

  it('is moderate in Race-specific (weeks 13-18): both around RIR 2', () => {
    for (const week of [13, 15, 18]) {
      expect(targetRirFor(week, true)).toBe(2)
      expect(targetRirFor(week, false)).toBe(2)
    }
  })

  it('is tighter in Specific prep (weeks 19-22): main lifts closer to failure than accessories', () => {
    for (const week of [19, 20, 22]) {
      expect(targetRirFor(week, true)).toBe(1)
      expect(targetRirFor(week, false)).toBe(2)
    }
  })

  it('eases again in the Taper (weeks 23-24): RIR 3 for both, same as Base', () => {
    for (const week of [23, 24]) {
      expect(targetRirFor(week, true)).toBe(3)
      expect(targetRirFor(week, false)).toBe(3)
    }
  })

  it('is monotonic in the direction described: Base higher than Build, Taper higher than Specific prep', () => {
    expect(targetRirFor(1, true)).toBeGreaterThan(targetRirFor(7, true))
    expect(targetRirFor(1, false)).toBeGreaterThanOrEqual(targetRirFor(7, false))
    expect(targetRirFor(23, true)).toBeGreaterThan(targetRirFor(19, true))
    expect(targetRirFor(24, false)).toBeGreaterThan(targetRirFor(22, false))
  })

  it('a main lift is never assigned a HIGHER (easier) target RIR than an accessory in the same week', () => {
    for (let week = 1; week <= 24; week += 1) {
      expect(targetRirFor(week, true)).toBeLessThanOrEqual(targetRirFor(week, false))
    }
  })
})

describe('SEED_WEEKS_24 target RIR (§ target RIR fix)', () => {
  it('every occurrence of a strength-progression exercise across the whole plan carries a target RIR', () => {
    const rirBearing = allPrescriptions().filter((p) => RIR_BEARING_EXERCISE_IDS.has(p.exerciseId))
    // Non-vacuous: real content across many weeks, not just a lucky one-off.
    expect(rirBearing.length).toBeGreaterThan(20)
    for (const p of rirBearing) {
      expect(p.targetRir, `${p.exerciseId} is missing a target RIR`).toBeDefined()
      expect(typeof p.targetRir).toBe('number')
    }
  })

  it('every one of the 8 HYROX station exercises never carries a target RIR', () => {
    const stationPrescriptions = allPrescriptions().filter((p) => STATION_EXERCISE_IDS.has(p.exerciseId))
    expect(stationPrescriptions.length).toBeGreaterThan(20)
    for (const p of stationPrescriptions) {
      expect(p.targetRir, `${p.exerciseId} unexpectedly carries a target RIR`).toBeUndefined()
    }
  })

  it('back squat\'s target RIR is non-increasing then rises again in the taper (Base -> Build -> Race-specific -> Specific prep -> Taper)', () => {
    const backSquatRirByWeek = new Map<number, number>()
    for (const week of SEED_WEEKS_24) {
      for (const template of week.templates) {
        const squat = template.prescriptions.find((p) => p.exerciseId === 'ex_back_squat')
        if (squat?.targetRir !== undefined) backSquatRirByWeek.set(week.weekNumber, squat.targetRir)
      }
    }
    // Non-vacuous: back squat appears in most weeks (Strength A).
    expect(backSquatRirByWeek.size).toBeGreaterThan(15)
    expect(backSquatRirByWeek.get(1)).toBe(3) // Base
    expect(backSquatRirByWeek.get(10)).toBe(2) // Build
    expect(backSquatRirByWeek.get(15)).toBe(2) // Race-specific
    expect(backSquatRirByWeek.get(20)).toBe(1) // Specific prep
    expect(backSquatRirByWeek.get(23)).toBe(3) // Taper
  })
})
