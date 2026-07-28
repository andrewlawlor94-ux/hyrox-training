import { describe, expect, it } from 'vitest'
import type { Exercise } from '@/data/types'
import type { StrengthRecommendation } from '@/domain/recommendations/strengthTarget'
import { hasUnknownLoad, targetLoadLabel } from '../loadPresentation'

const NOW = '2026-08-24T00:00:00.000Z'

function exercise(loadStyle: Exercise['loadStyle']): Exercise {
  return {
    id: 'ex_test', name: 'Test exercise', category: 'accessory', measurementType: 'strengthSets',
    loadStyle, defaultUnit: 'lb', defaultRestSec: 90, progressionIncrement: 5, incrementUnit: 'lb',
    defaultSets: 3, repMin: 8, repMax: 10, techniqueNotes: '', isArchived: false, isSeeded: true,
    createdAt: NOW, updatedAt: NOW,
  }
}

function recommendation(overrides: Partial<StrengthRecommendation>): StrengthRecommendation {
  return {
    previous: null, lastWeek: null, target: { value: 0, unit: 'lb' }, mode: 'default',
    reason: 'First time logging this exercise — starting from the plan default.', isOptionalAim: false,
    ...overrides,
  }
}

describe('hasUnknownLoad', () => {
  it('is false for a barbell exercise with a real seeded target', () => {
    const rec = recommendation({ target: { value: 175, unit: 'lb' } })
    expect(hasUnknownLoad(exercise('totalBarbell'), rec)).toBe(false)
  })

  it('is false for a body-weight exercise with a zero target — zero is a real answer there', () => {
    const rec = recommendation({ target: { value: 0, unit: 'lb' } })
    expect(hasUnknownLoad(exercise('bodyWeight'), rec)).toBe(false)
  })

  it('is false for a body-weight-plus-load exercise with a zero target', () => {
    const rec = recommendation({ target: { value: 0, unit: 'lb' } })
    expect(hasUnknownLoad(exercise('bodyWeightPlusLoad'), rec)).toBe(false)
  })

  it('is true for a machine exercise with no seeded target and no history', () => {
    const rec = recommendation({ target: { value: 0, unit: 'lb' } })
    expect(hasUnknownLoad(exercise('machineStack'), rec)).toBe(true)
  })

  it('is true for a barbell exercise with no seeded target and no history', () => {
    const rec = recommendation({ target: { value: 0, unit: 'lb' } })
    expect(hasUnknownLoad(exercise('totalBarbell'), rec)).toBe(true)
  })

  it('is false once previous performance exists, even at a zero target', () => {
    const rec = recommendation({
      previous: { load: { value: 0, unit: 'lb' }, reps: 5, date: '2026-08-17' },
      target: { value: 0, unit: 'lb' },
    })
    expect(hasUnknownLoad(exercise('machineStack'), rec)).toBe(false)
  })
})

describe('targetLoadLabel', () => {
  it('formats a real load normally', () => {
    const rec = recommendation({ target: { value: 175, unit: 'lb' } })
    expect(targetLoadLabel(exercise('totalBarbell'), rec)).toBe('175 lb')
  })

  it('reads "body weight" for a zero target on a body-weight exercise', () => {
    const rec = recommendation({ target: { value: 0, unit: 'lb' } })
    expect(targetLoadLabel(exercise('bodyWeight'), rec)).toBe('body weight')
  })

  it('formats a nonzero added load normally on a body-weight-plus-load exercise', () => {
    const rec = recommendation({ target: { value: 25, unit: 'lb' } })
    expect(targetLoadLabel(exercise('bodyWeightPlusLoad'), rec)).toBe('25 lb')
  })
})
