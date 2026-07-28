import { describe, expect, it, vi } from 'vitest'
import { SEED_EXERCISES } from '@/data/seed/exercises'
import { MIN_EFFECTIVE_WEEK_SESSIONS } from '@/domain/queue/constants'
import { SEED_WEEKS_24 } from '../index'
import type { SeedTemplate } from '../index'

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
    const week1 = SEED_WEEKS_24[0]!
    expect(() => {
      // @ts-expect-error -- intentional runtime mutation attempt against a readonly type
      week1.templates[0].name = 'mutated'
    }).toThrow()
    expect(() => {
      // @ts-expect-error -- intentional runtime mutation attempt against a readonly array
      SEED_WEEKS_24.push(week1)
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
