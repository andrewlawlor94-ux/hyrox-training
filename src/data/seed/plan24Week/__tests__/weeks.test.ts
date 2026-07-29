import { describe, expect, it, vi } from 'vitest'
import { SEED_EXERCISES } from '@/data/seed/exercises'
import { MIN_EFFECTIVE_WEEK_SESSIONS } from '@/domain/queue/constants'
import { SEED_WEEKS_24, assertMatchesTypicalEssentialSlots } from '../index'
import type { SeedTemplate, SeedWeek } from '../index'

/** Minimal fixture builder for `assertMatchesTypicalEssentialSlots` unit
 * tests below -- only `sessionSlot` and `priority` matter to that function. */
function fakeTemplate(sessionSlot: number, priority: SeedTemplate['priority']): SeedTemplate {
  return {
    sessionSlot,
    sequenceInWeek: sessionSlot,
    name: `slot ${String(sessionSlot)}`,
    kind: 'run',
    priority,
    recoveryTags: [],
    estMinutes: 30,
    prescriptions: [],
  }
}

const VALID_EXERCISE_IDS = new Set<string>(SEED_EXERCISES.map((e): string => e.id))
const weekByNumber = (n: number) => {
  const week = SEED_WEEKS_24.find((w) => w.weekNumber === n)
  if (!week) throw new Error(`No week ${String(n)} in SEED_WEEKS_24`)
  return week
}
const templateBySlot = (weekNumber: number, slot: number): SeedTemplate => {
  const template = weekByNumber(weekNumber).templates.find((t) => t.sessionSlot === slot)
  if (!template) throw new Error(`Week ${String(weekNumber)} has no template in slot ${String(slot)}`)
  return template
}
const allTemplates = () => SEED_WEEKS_24.flatMap((w) => w.templates)
const allPrescriptions = () => allTemplates().flatMap((t) => t.prescriptions)

/**
 * The 8 HYROX station exercises are dual/triple-use in this plan, so
 * exerciseId alone can't identify "real station-circuit content":
 * - `ex_ski_erg`/`ex_row` are also the Zone 2 conditioning exercise (built
 *   with `durationSec`, no `distanceM`/`repMin`).
 * - `ex_sled_push`/`ex_sled_pull`/`ex_farmer_carry`/`ex_burpee_broad_jump`/
 *   `ex_ski_erg` are also fixed-prescription Strength A/B accessory work
 *   (multiple sets at a literal distance, nothing to do with race-volume
 *   percentage).
 * Every station-circuit prescription, in contrast, is built by the single
 * shared `buildStationPrescription` helper (`stationCircuits.ts`), which
 * always sets `sets: 1` (one continuous station effort within a circuit) and
 * never sets `durationSec`. That combination is what actually identifies
 * race-volume-scaled station content, structurally, not just by exercise id.
 */
const STATION_EXERCISE_IDS = new Set([
  'ex_ski_erg', 'ex_sled_push', 'ex_sled_pull', 'ex_burpee_broad_jump', 'ex_row', 'ex_farmer_carry', 'ex_sandbag_lunge', 'ex_wall_ball',
])
const hasStationPrescription = (t: SeedTemplate) => t.prescriptions.some((p) => STATION_EXERCISE_IDS.has(p.exerciseId) && p.durationSec === undefined && p.sets === 1)

describe('SEED_WEEKS_24 structure', () => {
  it('has exactly 24 weeks, numbered 1..24 with no gaps', () => {
    expect(SEED_WEEKS_24).toHaveLength(24)
    expect(SEED_WEEKS_24.map((w) => w.weekNumber)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
  })

  it('every week has between 4 and 6 templates, and weeks 12/16/18/21/24 have fewer than 6', () => {
    const reducedWeeks = new Set([12, 16, 18, 21, 24])
    for (const week of SEED_WEEKS_24) {
      expect(week.templates.length).toBeGreaterThanOrEqual(4)
      expect(week.templates.length).toBeLessThanOrEqual(6)
      if (reducedWeeks.has(week.weekNumber)) expect(week.templates.length).toBeLessThan(6)
    }
    // Non-vacuous: at least one week actually has 6 (the common case) and at
    // least one actually has 4 (so the range check isn't trivially satisfied
    // by every week being the same size).
    expect(SEED_WEEKS_24.some((w) => w.templates.length === 6)).toBe(true)
    expect(SEED_WEEKS_24.some((w) => w.templates.length === 4)).toBe(true)
  })

  it('every week has at least MIN_EFFECTIVE_WEEK_SESSIONS templates', () => {
    for (const week of SEED_WEEKS_24) {
      expect(week.templates.length).toBeGreaterThanOrEqual(MIN_EFFECTIVE_WEEK_SESSIONS)
    }
  })

  it('sessionSlot values within a week are unique and in 1..6; sequenceInWeek is 0-based and contiguous', () => {
    for (const week of SEED_WEEKS_24) {
      const slots = week.templates.map((t) => t.sessionSlot)
      expect(new Set(slots).size).toBe(slots.length)
      for (const slot of slots) {
        expect(slot).toBeGreaterThanOrEqual(1)
        expect(slot).toBeLessThanOrEqual(6)
      }
      const sequences = week.templates.map((t) => t.sequenceInWeek).sort((a, b) => a - b)
      expect(sequences).toEqual(Array.from({ length: week.templates.length }, (_, i) => i))
    }
  })

  // The aggregate checks below all run over `allPrescriptions()`, which a
  // template contributing ZERO prescriptions passes vacuously -- the exact shape
  // that let three Base weeks ship with no exercises at all. Assert per
  // template, and name the offenders, so an empty session cannot hide inside a
  // healthy total.
  it('every template prescribes at least one exercise', () => {
    const templates = allTemplates()
    expect(templates.length).toBeGreaterThan(0)
    const empty = templates.filter((t) => t.prescriptions.length === 0).map((t) => t.name)
    expect(empty).toEqual([])
  })

  it('every prescriptions[].exerciseId resolves against SEED_EXERCISES', () => {
    const prescriptions = allPrescriptions()
    expect(prescriptions.length).toBeGreaterThan(0)
    const offenders = prescriptions.filter((p) => !VALID_EXERCISE_IDS.has(p.exerciseId))
    expect(offenders).toEqual([])
  })

  it('every prescription has a positive restSec', () => {
    const prescriptions = allPrescriptions()
    expect(prescriptions.length).toBeGreaterThan(0)
    for (const p of prescriptions) expect(p.restSec).toBeGreaterThan(0)
  })

  it('phases cover weeks 1-24 contiguously with no overlap', () => {
    const expectedRanges: [string, number, number][] = [
      ['Base', 1, 6], ['Build', 7, 12], ['Race-specific', 13, 18], ['Specific prep', 19, 22], ['Taper', 23, 24],
    ]
    for (const week of SEED_WEEKS_24) {
      const range = expectedRanges.find(([name]) => name === week.phaseName)
      expect(range).toBeDefined()
      const [, start, end] = range!
      expect(week.weekNumber).toBeGreaterThanOrEqual(start)
      expect(week.weekNumber).toBeLessThanOrEqual(end)
    }
    // No gaps and no overlap: every week 1..24 is covered by exactly one range.
    for (let n = 1; n <= 24; n += 1) {
      const covering = expectedRanges.filter(([, start, end]) => n >= start && n <= end)
      expect(covering).toHaveLength(1)
    }
  })

  it('weeks 4 and 8 are marked isDeload; no other week is', () => {
    for (const week of SEED_WEEKS_24) {
      expect(week.isDeload).toBe(week.weekNumber === 4 || week.weekNumber === 8)
    }
  })

  it('week 12 contains a benchmark 5 km run and a simulation template', () => {
    const week12 = weekByNumber(12)
    const benchmark = week12.templates.find((t) => t.kind === 'run' && t.name.toLowerCase().includes('benchmark'))
    expect(benchmark).toBeDefined()
    expect(benchmark?.prescriptions.some((p) => p.distanceM === 5000)).toBe(true)
    const simulation = week12.templates.find((t) => t.kind === 'simulation')
    expect(simulation).toBeDefined()
    expect(simulation?.stationVolumePct).toBe(50)
  })

  it('week 18 contains a simulation template with stationVolumePct === 75', () => {
    const simulation = weekByNumber(18).templates.find((t) => t.kind === 'simulation')
    expect(simulation).toBeDefined()
    expect(simulation?.stationVolumePct).toBe(75)
  })

  it('week 21 contains a simulation template with stationVolumePct === 100, controlled not all-out', () => {
    const simulation = weekByNumber(21).templates.find((t) => t.kind === 'simulation')
    expect(simulation).toBeDefined()
    expect(simulation?.stationVolumePct).toBe(100)
    const notes = simulation?.notes ?? ''
    expect(notes.toLowerCase()).toContain('controlled')
    expect(notes.toLowerCase()).not.toContain('all-out race,')
    expect(/not an all-out race/i.test(notes)).toBe(true)
  })

  it('weeks 19, 20, 22, 23 contain no simulation template', () => {
    for (const n of [19, 20, 22, 23]) {
      const simulations = weekByNumber(n).templates.filter((t) => t.kind === 'simulation')
      expect(simulations).toEqual([])
    }
  })

  it('week 24 contains a race template', () => {
    const race = weekByNumber(24).templates.find((t) => t.kind === 'race')
    expect(race).toBeDefined()
  })

  it('stationVolumePct is non-decreasing across weeks 13-21 except the week 16 consolidation dip', () => {
    const weekPct: Record<number, number> = {}
    for (let n = 13; n <= 21; n += 1) {
      const withPct = weekByNumber(n).templates.find((t) => t.sessionSlot === 6 && t.stationVolumePct !== undefined)
      expect(withPct).toBeDefined()
      weekPct[n] = withPct!.stationVolumePct!
    }
    expect(weekPct).toEqual({ 13: 50, 14: 60, 15: 70, 16: 40, 17: 75, 18: 75, 19: 80, 20: 80, 21: 100 })
    const withoutDip = [13, 14, 15, 17, 18, 19, 20, 21].map((n) => weekPct[n])
    for (let i = 1; i < withoutDip.length; i += 1) {
      expect(withoutDip[i]!).toBeGreaterThanOrEqual(withoutDip[i - 1]!)
    }
    // The dip is real: week 16 is strictly less than both its neighbours in the sequence.
    expect(weekPct[16]!).toBeLessThan(weekPct[15]!)
    expect(weekPct[16]!).toBeLessThan(weekPct[17]!)
  })

  it('every template with a defined stationVolumePct contains at least one station prescription', () => {
    const withPct = allTemplates().filter((t) => t.stationVolumePct !== undefined)
    expect(withPct.length).toBeGreaterThan(0)
    for (const t of withPct) {
      expect(hasStationPrescription(t), `"${t.name}" (week slot ${String(t.sessionSlot)}) has stationVolumePct but no station prescription`).toBe(true)
    }
  })

  it('every template with station prescriptions in weeks 13-21 has a defined stationVolumePct', () => {
    const weeks13to21 = SEED_WEEKS_24.filter((w) => w.weekNumber >= 13 && w.weekNumber <= 21)
    const withStations = weeks13to21.flatMap((w) => w.templates).filter(hasStationPrescription)
    expect(withStations.length).toBeGreaterThan(0)
    for (const t of withStations) {
      expect(t.stationVolumePct, `"${t.name}" has station prescriptions but no stationVolumePct`).toBeDefined()
    }
  })

  it('every template referencing Wall ball carries the overhead-clearance note', () => {
    const wallBallTemplates = allTemplates().filter((t) => t.prescriptions.some((p) => p.exerciseId === 'ex_wall_ball'))
    expect(wallBallTemplates.length).toBeGreaterThan(0)
    for (const t of wallBallTemplates) {
      const wallBallPrescriptions = t.prescriptions.filter((p) => p.exerciseId === 'ex_wall_ball')
      for (const p of wallBallPrescriptions) {
        expect(p.notes?.toLowerCase()).toContain('overhead clearance')
      }
    }
  })

  it('easy-run duration is non-decreasing across weeks 1-3 and drops in week 4 (deload)', () => {
    const easyMinutes = (n: number) => templateBySlot(n, 2).estMinutes
    expect(easyMinutes(2)).toBeGreaterThanOrEqual(easyMinutes(1))
    expect(easyMinutes(3)).toBeGreaterThanOrEqual(easyMinutes(2))
    expect(easyMinutes(4)).toBeLessThan(easyMinutes(3))
  })

  it('weeks 1-6 easy/quality/long-run durations exactly match the pinned table', () => {
    const EASY = [30, 35, 35, 30, 40, 40]
    const LONG = [40, 45, 50, 40, 55, 60]
    const QUALITY: [number, number][] = [
      [6, 2], [7, 2], [5, 3], [6, 1], [4, 5], [5, 4],
    ]
    for (let i = 0; i < 6; i += 1) {
      const week = i + 1
      const easyDurationSec = templateBySlot(week, 2).prescriptions.find((p) => p.exerciseId === 'ex_easy_run')?.durationSec
      expect(easyDurationSec).toBe(EASY[i]! * 60)
      const longDurationSec = templateBySlot(week, 6).prescriptions.find((p) => p.exerciseId === 'ex_long_run')?.durationSec
      expect(longDurationSec).toBe(LONG[i]! * 60)
      const qualitySpec = templateBySlot(week, 4).prescriptions.find((p) => p.exerciseId === 'ex_quality_run')?.intervalSpec
      expect(qualitySpec?.reps).toBe(QUALITY[i]![0])
      expect(qualitySpec?.workSec).toBe(QUALITY[i]![1] * 60)
    }
  })

  it('every easy-run template carries all three lower-leg durability exercises', () => {
    const easyRunTemplates = allTemplates().filter((t) => t.prescriptions.some((p) => p.exerciseId === 'ex_easy_run'))
    expect(easyRunTemplates.length).toBeGreaterThan(0)
    const DURABILITY_IDS = ['ex_calf_raise_straight_knee', 'ex_calf_raise_bent_knee', 'ex_tibialis_raise']
    for (const t of easyRunTemplates) {
      const exerciseIds = t.prescriptions.map((p) => p.exerciseId)
      for (const id of DURABILITY_IDS) expect(exerciseIds).toContain(id)
    }
  })

  it('every paceSource: goalRacePace prescription omits a hard-coded targetPaceSecPerKm', () => {
    const goalPacePrescriptions = allPrescriptions().filter((p) => p.paceSource === 'goalRacePace')
    expect(goalPacePrescriptions.length).toBeGreaterThan(0)
    for (const p of goalPacePrescriptions) expect(p.targetPaceSecPerKm).toBeUndefined()
  })

  it('no template has an empty name or a zero estMinutes', () => {
    const templates = allTemplates()
    expect(templates.length).toBeGreaterThan(0)
    for (const t of templates) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.estMinutes).toBeGreaterThan(0)
    }
  })

  it('is deeply frozen: mutation attempts throw, and re-building the module is deterministic', async () => {
    // Cast through a mutable type rather than `@ts-expect-error` + a readonly
    // violation: this represents "a caller that (wrongly) treats the seed
    // data as mutable JS", which is exactly the runtime case `deepFreeze`
    // exists to guard -- and it resolves cleanly for typed linting, unlike
    // deliberately-broken TS expressions whose resulting type is `any`.
    const week1 = SEED_WEEKS_24[0]!
    const mutableWeeks = SEED_WEEKS_24 as unknown as SeedWeek[]
    expect(() => {
      week1.templates[0]!.name = 'mutated'
    }).toThrow()
    expect(() => {
      mutableWeeks.push(week1)
    }).toThrow()

    // Two independent module instantiations produce deeply-equal (but not
    // reference-identical) structures -- guards against hidden nondeterminism
    // and against a builder bug that reuses one mutable array across weeks.
    vi.resetModules()
    const { SEED_WEEKS_24: reimported } = await import('../index')
    expect(reimported).not.toBe(SEED_WEEKS_24)
    expect(reimported).toEqual(SEED_WEEKS_24)

    const week1StrengthA = templateBySlot(1, 1).prescriptions
    const week2StrengthA = templateBySlot(2, 1).prescriptions
    expect(week1StrengthA).not.toBe(week2StrengthA)
  })
})

describe('assertMatchesTypicalEssentialSlots (permanent regression, D7)', () => {
  // A 6-slot week where the actual essential/important split is {1,2,4,6}
  // essential, 5 important (matching Race-specific/Specific prep/Taper).
  const weekSlots = [1, 2, 4, 5, 6]
  const templates = [
    fakeTemplate(1, 'essential'),
    fakeTemplate(2, 'essential'),
    fakeTemplate(4, 'essential'),
    fakeTemplate(5, 'important'),
    fakeTemplate(6, 'essential'),
  ]

  it('throws when essentialSlots disagrees with the templates actually built', () => {
    // Deliberately inconsistent: claims slot 5 is essential and slot 2 is
    // not, which is exactly the class of bug this task's coordinator audit
    // found (essentialSlots/importantSlot drifting apart in the source
    // data). This is a permanent regression test, not a manual break-and-
    // revert: it constructs the inconsistency directly, so it can't be
    // silently lost in a future refactor.
    expect(() => assertMatchesTypicalEssentialSlots(1, weekSlots, templates, [1, 4, 5, 6])).toThrow(/do not match/)
  })

  it('does not throw when essentialSlots agrees with the templates actually built', () => {
    expect(() => assertMatchesTypicalEssentialSlots(1, weekSlots, templates, [1, 2, 4, 6])).not.toThrow()
  })

  it('is a no-op for reduced-to-minimum weeks (<= MIN_EFFECTIVE_WEEK_SESSIONS slots), even when essentialSlots disagrees', () => {
    const fourSlots = [1, 2, 4, 6]
    const allEssential = fourSlots.map((slot) => fakeTemplate(slot, 'essential'))
    expect(fourSlots.length).toBe(MIN_EFFECTIVE_WEEK_SESSIONS)
    // essentialSlots here (from a different phase) disagrees with the
    // actual set -- D5 overrides the phase's typical split for
    // reduced-to-minimum weeks, so this must NOT throw.
    expect(() => assertMatchesTypicalEssentialSlots(12, fourSlots, allEssential, [1, 4, 5, 6])).not.toThrow()
  })
})
