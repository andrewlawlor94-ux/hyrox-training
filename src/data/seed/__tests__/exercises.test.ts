import { describe, expect, it } from 'vitest'
import { SEED_EXERCISES } from '../exercises'

const byName = (name: string) => SEED_EXERCISES.find((e) => e.name === name)

describe('exercise library seed', () => {
  it('has unique ids and unique names', () => {
    expect(new Set(SEED_EXERCISES.map((e) => e.id)).size).toBe(SEED_EXERCISES.length)
    expect(new Set(SEED_EXERCISES.map((e) => e.name)).size).toBe(SEED_EXERCISES.length)
  })

  it('includes every exercise the 24-week plan prescribes', () => {
    for (const name of [
      'Back squat', 'Romanian deadlift', 'Bulgarian split squat', 'Bench press',
      'Lat pulldown', 'Pull-up', 'Walking lunge', 'Pallof press', 'Side plank',
      'Sled push', 'Sled pull', 'Farmer carry', 'Burpee broad jump',
      'SkiErg', 'Row', 'Sandbag lunge', 'Wall ball',
      'Straight-knee calf raise', 'Bent-knee calf raise', 'Tibialis raise',
      'Easy run', 'Long run', 'Quality run', 'Compromised run',
    ]) {
      expect(byName(name), `missing seeded exercise: ${name}`).toBeDefined()
    }
  })

  it.each([
    ['Back squat', 150], ['Romanian deadlift', 120], ['Bench press', 120],
    ['Bulgarian split squat', 90], ['Walking lunge', 90], ['Sled push', 90],
    ['Sled pull', 90], ['Farmer carry', 90], ['Wall ball', 60],
    ['Burpee broad jump', 60], ['Pallof press', 45], ['Lat pulldown', 60],
  ])('seeds the %s rest default at %i seconds', (name, restSec) => {
    expect(byName(name)?.defaultRestSec).toBe(restSec)
  })

  it('gives standard barbell lifts a 5 lb increment', () => {
    for (const name of ['Back squat', 'Romanian deadlift', 'Bench press']) {
      expect(byName(name)).toMatchObject({ progressionIncrement: 5, incrementUnit: 'lb' })
    }
  })

  it('gives station exercises a zero increment so they never auto-progress', () => {
    for (const name of ['Sled push', 'Sled pull', 'Farmer carry', 'Sandbag lunge', 'Wall ball']) {
      expect(byName(name)?.progressionIncrement).toBe(0)
    }
  })

  it('defaults station loads to kilograms to match competition standards', () => {
    for (const name of ['Sled push', 'Sled pull', 'Farmer carry', 'Sandbag lunge', 'Wall ball']) {
      expect(byName(name)?.defaultUnit).toBe('kg')
    }
  })

  it('defaults barbell loads to pounds', () => {
    expect(byName('Back squat')?.defaultUnit).toBe('lb')
  })

  it('uses per-dumbbell load style for the split squat', () => {
    expect(byName('Bulgarian split squat')?.loadStyle).toBe('perDumbbell')
  })

  it('uses body weight load style for walking lunges', () => {
    expect(byName('Walking lunge')?.loadStyle).toBe('bodyWeight')
  })

  it('categorizes the calf and tibialis work so it is never symptom-gated', () => {
    for (const name of ['Straight-knee calf raise', 'Bent-knee calf raise', 'Tibialis raise']) {
      expect(byName(name)?.category).toBe('calf')
    }
  })

  it('marks every seeded exercise active and seeded', () => {
    expect(SEED_EXERCISES.every((e) => !e.isArchived && e.isSeeded)).toBe(true)
  })

  it('gives run exercises a distance or duration measurement type', () => {
    for (const name of ['Easy run', 'Long run', 'Quality run', 'Compromised run']) {
      expect(['distance', 'duration', 'pace']).toContain(byName(name)?.measurementType)
    }
  })

  it('carries technique notes on the technical stations', () => {
    for (const name of ['Wall ball', 'Sled push', 'Burpee broad jump', 'Sandbag lunge']) {
      expect(byName(name)?.techniqueNotes.length).toBeGreaterThan(0)
    }
  })
})
