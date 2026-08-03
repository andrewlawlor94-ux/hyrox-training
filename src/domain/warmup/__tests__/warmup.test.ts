import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseCategory } from '@/domain/types'
import { warmupDrillsFor } from '../drills'
import { warmupRampFor } from '../ramp'

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex_test',
    name: 'Test lift',
    category: 'squat',
    measurementType: 'strengthSets',
    loadStyle: 'totalBarbell',
    defaultUnit: 'lb',
    defaultRestSec: 150,
    progressionIncrement: 5,
    incrementUnit: 'lb',
    defaultSets: 4,
    repMin: 4,
    repMax: 6,
    techniqueNotes: '',
    isArchived: false,
    isSeeded: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('warmupDrillsFor', () => {
  // The athlete's own example: "lifting deadlift or squats should have some core
  // warm up like dead bugs and other things".
  it('gives squats and hinges core and hip prep, including dead bugs', () => {
    for (const category of ['squat', 'hinge'] as ExerciseCategory[]) {
      const ids = warmupDrillsFor([category]).map((d) => d.id)
      expect(ids, category).toContain('dead_bug')
      expect(ids, category).toContain('glute_bridge')
    }
  })

  it('prescribes by MOVEMENT, so a press day gets shoulder prep and no squat pattern', () => {
    const ids = warmupDrillsFor(['press']).map((d) => d.id)
    expect(ids).toContain('band_pull_apart')
    expect(ids).toContain('wall_slide')
    expect(ids).not.toContain('bodyweight_squat')
    expect(ids).not.toContain('dead_bug')
  })

  it('gives a run lower-leg prep, which is where this plan\'s injury risk sits', () => {
    const ids = warmupDrillsFor(['run']).map((d) => d.id)
    expect(ids).toContain('calf_raise_warm')
    expect(ids).toContain('ankle_bounces')
    expect(ids).toContain('leg_swings')
  })

  it('lists each drill once for a session that repeats a demand', () => {
    // Squat and hinge both want dead bugs and glute bridges.
    const drills = warmupDrillsFor(['squat', 'hinge', 'core'])
    const ids = drills.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => id === 'dead_bug')).toHaveLength(1)
  })

  it('orders drills by the session\'s own exercise order', () => {
    // A press-first day starts with shoulder prep; a squat-first day does not.
    expect(warmupDrillsFor(['press', 'squat'])[0]?.id).toBe('band_pull_apart')
    expect(warmupDrillsFor(['squat', 'press'])[0]?.id).toBe('dead_bug')
  })

  it('contributes nothing for accessory work rather than padding the list', () => {
    expect(warmupDrillsFor(['accessory'])).toEqual([])
  })

  it('every drill states a dose and a reason', () => {
    const every: ExerciseCategory[] = [
      'squat', 'hinge', 'lunge', 'press', 'pull', 'core', 'carry',
      'sled', 'erg', 'plyo', 'run', 'wallBall', 'calf', 'accessory',
    ]
    const drills = warmupDrillsFor(every)
    expect(drills.length).toBeGreaterThan(0)
    for (const drill of drills) {
      expect(drill.name.trim(), drill.id).not.toBe('')
      expect(drill.dose.trim(), drill.id).not.toBe('')
      // A warm-up list with no reasons is a list to skip.
      expect(drill.why.trim(), drill.id).not.toBe('')
    }
  })

  it('is pure: the same categories always give the same drills', () => {
    expect(warmupDrillsFor(['squat', 'press'])).toEqual(warmupDrillsFor(['squat', 'press']))
  })
})

describe('warmupRampFor', () => {
  it('ramps a barbell lift in rising load and falling reps, ending below the working weight', () => {
    const sets = warmupRampFor(exercise(), { value: 200, unit: 'lb' })
    expect(sets.map((s) => s.load.value)).toEqual([80, 110, 140, 170])
    expect(sets.map((s) => s.reps)).toEqual([5, 5, 3, 2])
    // Reps must fall as load rises, or the warm-up becomes the workout.
    for (let i = 1; i < sets.length; i += 1) {
      expect(sets[i]!.load.value).toBeGreaterThan(sets[i - 1]!.load.value)
      expect(sets[i]!.reps).toBeLessThanOrEqual(sets[i - 1]!.reps)
    }
    // Never at or above the working weight — the working sets cover that.
    for (const set of sets) expect(set.load.value).toBeLessThan(200)
  })

  it('rounds DOWN to a loadable weight, using the exercise\'s own increment', () => {
    // 40% of 185 is 74, which is not loadable in 5 lb jumps.
    const sets = warmupRampFor(exercise(), { value: 185, unit: 'lb' })
    for (const set of sets) expect(set.load.value % 5).toBe(0)
    expect(sets[0]?.load.value).toBe(70) // floor(74 / 5) * 5
  })

  it('uses a 2.5 kg step for a kilo lift rather than the pound increment', () => {
    const kgLift = exercise({ defaultUnit: 'kg', progressionIncrement: 5, incrementUnit: 'lb' })
    const sets = warmupRampFor(kgLift, { value: 100, unit: 'kg' })
    // The exercise's increment is in lb, so it cannot be applied to a kg load —
    // falls back to 2.5 kg instead of silently mixing units.
    for (const set of sets) expect((set.load.value * 10) % 25).toBe(0)
  })

  it('offers no ramp for an ISOLATION movement, however heavy it is loaded', () => {
    // The athlete asked for warm-up reps on COMPOUND moves. A Pallof press or a
    // calf raise does not need four progressively heavier sets, and offering
    // them made the card read as noise.
    for (const category of ['core', 'calf', 'carry', 'accessory'] as const) {
      expect(warmupRampFor(exercise({ category }), { value: 200, unit: 'lb' }), category).toEqual([])
    }
    // ...and still does for the multi-joint patterns that do benefit.
    for (const category of ['squat', 'hinge', 'lunge', 'press', 'pull'] as const) {
      expect(warmupRampFor(exercise({ category }), { value: 200, unit: 'lb' }).length, category).toBeGreaterThan(0)
    }
  })

  it('offers no ramp for a body-weight movement, where there is nothing to ramp', () => {
    expect(warmupRampFor(exercise({ loadStyle: 'bodyWeight' }), { value: 200, unit: 'lb' })).toEqual([])
    expect(warmupRampFor(exercise({ loadStyle: 'custom' }), { value: 200, unit: 'lb' })).toEqual([])
  })

  it('offers no ramp for a light working weight, where lighter sets are pointless', () => {
    expect(warmupRampFor(exercise(), { value: 30, unit: 'lb' })).toEqual([])
  })

  it('never returns a duplicate weight', () => {
    // Around the ramp's bottom, two percentages can floor onto the same plate.
    for (const working of [40, 45, 50, 55, 60, 95, 135, 225, 315]) {
      const sets = warmupRampFor(exercise(), { value: working, unit: 'lb' })
      const values = sets.map((s) => s.load.value)
      expect(new Set(values).size, `working ${String(working)}`).toBe(values.length)
    }
  })

  it('never returns a non-finite or negative load, whatever it is handed', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -200, 0]) {
      const sets = warmupRampFor(exercise(), { value: bad, unit: 'lb' })
      for (const set of sets) {
        expect(Number.isFinite(set.load.value)).toBe(true)
        expect(set.load.value).toBeGreaterThan(0)
      }
    }
  })

  it('numbers its sets from 1 with no gaps, even after collapsing duplicates', () => {
    for (const working of [40, 55, 95, 200]) {
      const sets = warmupRampFor(exercise(), { value: working, unit: 'lb' })
      expect(sets.map((s) => s.index)).toEqual(sets.map((_, i) => i + 1))
    }
  })

  it('is pure: the same lift and load always give the same ramp', () => {
    const lift = exercise()
    expect(warmupRampFor(lift, { value: 225, unit: 'lb' })).toEqual(warmupRampFor(lift, { value: 225, unit: 'lb' }))
  })
})
