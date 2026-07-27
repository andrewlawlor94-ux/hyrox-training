import { describe, expect, it } from 'vitest'
import type { Exercise } from '@/domain/types'
import { effectiveIncrement, gatingSymptomFor, isSymptomGated } from '../increments'

const base: Exercise = {
  id: 'ex', name: 'X', category: 'squat', measurementType: 'strengthSets',
  loadStyle: 'totalBarbell', defaultUnit: 'lb', defaultRestSec: 150,
  progressionIncrement: 5, incrementUnit: 'lb', defaultSets: 4, repMin: 4, repMax: 6,
  techniqueNotes: '', isArchived: false, isSeeded: true,
  createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
}

const calm = {
  shin: { level: 'green' as const, spikeFlag: false, persistenceFlag: false },
  sciatic: { level: 'green' as const, spikeFlag: false, persistenceFlag: false },
}

describe('effectiveIncrement', () => {
  it('uses the exercise increment and unit', () => {
    expect(effectiveIncrement({ ...base, progressionIncrement: 10, incrementUnit: 'lb' }))
      .toEqual({ value: 10, unit: 'lb' })
  })

  it('returns a zero increment for station loads so they never auto-increase', () => {
    expect(effectiveIncrement({ ...base, category: 'sled', progressionIncrement: 0, incrementUnit: 'kg' }))
      .toEqual({ value: 0, unit: 'kg' })
  })
})

describe('gatingSymptomFor', () => {
  it.each([
    ['squat', 'sciatic'], ['hinge', 'sciatic'], ['lunge', 'sciatic'], ['carry', 'sciatic'],
    ['plyo', 'shin'], ['run', 'shin'],
    ['press', null], ['pull', null], ['core', null], ['calf', null],
    ['erg', null], ['accessory', null], ['sled', null], ['wallBall', null],
  ] as const)('maps %s to %s', (category, expected) => {
    expect(gatingSymptomFor(category)).toBe(expected)
  })
})

describe('isSymptomGated', () => {
  it('does not gate a bench press when shin pain is elevated (D2)', () => {
    const symptoms = { ...calm, shin: { level: 'elevated' as const, spikeFlag: true, persistenceFlag: false } }
    expect(isSymptomGated({ ...base, category: 'press' }, symptoms)).toBe(false)
  })

  it('gates a back squat when sciatic symptoms are elevated', () => {
    const symptoms = { ...calm, sciatic: { level: 'elevated' as const, spikeFlag: false, persistenceFlag: false } }
    expect(isSymptomGated({ ...base, category: 'squat' }, symptoms)).toBe(true)
  })

  it('gates on a spike flag even when the level is only caution', () => {
    const symptoms = { ...calm, sciatic: { level: 'caution' as const, spikeFlag: true, persistenceFlag: false } }
    expect(isSymptomGated({ ...base, category: 'hinge' }, symptoms)).toBe(true)
  })

  it('gates on a persistence flag', () => {
    const symptoms = { ...calm, shin: { level: 'caution' as const, spikeFlag: false, persistenceFlag: true } }
    expect(isSymptomGated({ ...base, category: 'plyo' }, symptoms)).toBe(true)
  })

  it('does not gate when the relevant stream is green and unflagged', () => {
    expect(isSymptomGated({ ...base, category: 'squat' }, calm)).toBe(false)
  })
})
