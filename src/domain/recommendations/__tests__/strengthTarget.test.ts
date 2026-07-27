import { describe, expect, it } from 'vitest'
import type { Exercise } from '@/domain/types'
import { kgToLb, lbToKg } from '@/domain/units/convert'
import type { RecommendationSymptomState } from '../increments'
import type { StrengthSessionHistory } from '../strengthTarget'
import { recommendStrengthTarget } from '../strengthTarget'

const squat: Exercise = {
  id: 'ex_squat', name: 'Back squat', category: 'squat', measurementType: 'strengthSets',
  loadStyle: 'totalBarbell', defaultUnit: 'lb', defaultRestSec: 150,
  progressionIncrement: 5, incrementUnit: 'lb', defaultSets: 4, repMin: 5, repMax: 5,
  techniqueNotes: '', isArchived: false, isSeeded: true,
  createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
}
// prescription only ever reads targetLoad/loadUnit — sets/repMin dropped
// from the Pick (and from this fixture) since the per-session
// prescribedSets/prescribedRepMin on StrengthSessionHistory are the actual
// source used to evaluate whether a session met its prescription.
const rx = { targetLoad: 175, loadUnit: 'lb' as const }
// Explicitly typed (rather than inferred from the 'green' as const literals)
// so `call`'s `symptoms = calm` default parameter widens to
// RecommendationSymptomState instead of narrowing to a type that only
// accepts 'green' — otherwise passing 'elevated'/'caution' symptom overrides
// at other call sites fails to typecheck against the inferred default.
const calm: RecommendationSymptomState = {
  shin: { level: 'green', spikeFlag: false, persistenceFlag: false },
  sciatic: { level: 'green', spikeFlag: false, persistenceFlag: false },
}
const TODAY = '2026-08-24'

function session(date: string, weight: number, reps: number, rir?: number): StrengthSessionHistory {
  return {
    date, prescribedSets: 4, prescribedRepMin: 5,
    completedSets: Array.from({ length: 4 }, () => (rir === undefined ? { weight, unit: 'lb' as const, reps } : { weight, unit: 'lb' as const, reps, rir })),
  }
}

function call(history: StrengthSessionHistory[], symptoms = calm) {
  return recommendStrengthTarget({ exercise: squat, prescription: rx, history, symptoms, today: TODAY })
}

describe('no history', () => {
  const r = call([])

  it('falls back to the prescription target load', () => {
    expect(r.target).toEqual({ value: 175, unit: 'lb' })
  })

  it('reports mode default with no previous performance', () => {
    expect(r.mode).toBe('default')
    expect(r.previous).toBeNull()
  })

  it('explains the fallback', () => {
    expect(r.reason).toBe('First time logging this exercise — starting from the plan default.')
  })
})

describe('no history and no prescription target', () => {
  it('falls back to the exercise default unit with a zero value and says so', () => {
    const r = recommendStrengthTarget({
      exercise: squat, prescription: {},
      history: [], symptoms: calm, today: TODAY,
    })
    expect(r.target).toEqual({ value: 0, unit: 'lb' })
    expect(r.mode).toBe('default')
  })
})

describe('all reps completed with RIR >= 1', () => {
  const r = call([session('2026-08-17', 175, 5, 2)])

  it('recommends previous plus the increment', () => {
    expect(r.target).toEqual({ value: 180, unit: 'lb' })
  })

  it('reports mode increase and is not merely an aim', () => {
    expect(r.mode).toBe('increase')
    expect(r.isOptionalAim).toBe(false)
  })

  it('explains why', () => {
    expect(r.reason).toBe('You completed all prescribed reps last time.')
  })

  it('reports the previous performance and its date', () => {
    expect(r.previous).toEqual({ load: { value: 175, unit: 'lb' }, reps: 5, date: '2026-08-17' })
  })
})

describe('all reps completed but no RIR recorded', () => {
  const r = call([session('2026-08-17', 175, 5)])

  it('offers the increase as an optional aim', () => {
    expect(r.mode).toBe('optionalIncrease')
    expect(r.isOptionalAim).toBe(true)
    expect(r.target).toEqual({ value: 180, unit: 'lb' })
  })

  it('explains that the increase is optional because effort was not recorded', () => {
    expect(r.reason).toBe('All reps completed, but no RIR recorded — treat 180 lb as an optional aim.')
  })
})

describe('reps missed', () => {
  const r = call([session('2026-08-17', 175, 4)])

  it('repeats the previous weight', () => {
    expect(r.mode).toBe('repeat')
    expect(r.target).toEqual({ value: 175, unit: 'lb' })
  })

  it('explains the miss', () => {
    expect(r.reason).toBe('Repeating 175 lb — you did not complete all prescribed reps last time.')
  })
})

describe('mean RIR of zero', () => {
  it('repeats the previous weight even though reps were completed', () => {
    const r = call([session('2026-08-17', 175, 5, 0)])
    expect(r.mode).toBe('repeat')
    expect(r.target).toEqual({ value: 175, unit: 'lb' })
    expect(r.reason).toBe('Repeating 175 lb — last set went to failure (RIR 0).')
  })

  it('rounds a mean RIR below 1 down to a repeat', () => {
    const mixed: StrengthSessionHistory = {
      date: '2026-08-17', prescribedSets: 4, prescribedRepMin: 5,
      completedSets: [
        { weight: 175, unit: 'lb', reps: 5, rir: 1 }, { weight: 175, unit: 'lb', reps: 5, rir: 0 },
        { weight: 175, unit: 'lb', reps: 5, rir: 0 }, { weight: 175, unit: 'lb', reps: 5, rir: 0 },
      ],
    }
    expect(call([mixed]).mode).toBe('repeat')
  })
})

describe('fewer sets completed than prescribed', () => {
  it('counts as a missed session and repeats', () => {
    const short: StrengthSessionHistory = {
      date: '2026-08-17', prescribedSets: 4, prescribedRepMin: 5,
      completedSets: [{ weight: 175, unit: 'lb', reps: 5, rir: 3 }, { weight: 175, unit: 'lb', reps: 5, rir: 3 }],
    }
    expect(call([short]).mode).toBe('repeat')
  })
})

describe('symptom gating (D2)', () => {
  it('holds the weight when sciatic symptoms are elevated, naming the symptom', () => {
    const symptoms = { ...calm, sciatic: { level: 'elevated' as const, spikeFlag: false, persistenceFlag: false } }
    const r = call([session('2026-08-17', 175, 5, 3)], symptoms)
    expect(r.mode).toBe('symptomHold')
    expect(r.target).toEqual({ value: 175, unit: 'lb' })
    expect(r.reason).toBe('Holding 175 lb while sciatic/back symptoms are elevated.')
  })

  it('still progresses a squat when only shin pain is elevated', () => {
    const symptoms = { ...calm, shin: { level: 'elevated' as const, spikeFlag: true, persistenceFlag: false } }
    expect(call([session('2026-08-17', 175, 5, 3)], symptoms).mode).toBe('increase')
  })

  it('takes precedence over an otherwise-qualifying increase', () => {
    const symptoms = { ...calm, sciatic: { level: 'caution' as const, spikeFlag: true, persistenceFlag: false } }
    expect(call([session('2026-08-17', 175, 5, 4)], symptoms).mode).toBe('symptomHold')
  })

  it('holds the weight when shin symptoms are elevated on a shin-gated (plyo) exercise, naming the symptom', () => {
    const boxJump: Exercise = { ...squat, id: 'ex_boxjump', name: 'Box jump', category: 'plyo' }
    const symptoms = { ...calm, shin: { level: 'elevated' as const, spikeFlag: false, persistenceFlag: false } }
    const r = recommendStrengthTarget({
      exercise: boxJump, prescription: rx, history: [session('2026-08-17', 175, 5, 3)], symptoms, today: TODAY,
    })
    expect(r.mode).toBe('symptomHold')
    expect(r.target).toEqual({ value: 175, unit: 'lb' })
    expect(r.reason).toBe('Holding 175 lb while shin symptoms are elevated.')
  })

  it('still progresses an exercise gated by neither stream even when both shin and sciatic are elevated', () => {
    const benchPress: Exercise = { ...squat, id: 'ex_bench', name: 'Bench press', category: 'press' }
    const symptoms: RecommendationSymptomState = {
      shin: { level: 'elevated', spikeFlag: false, persistenceFlag: false },
      sciatic: { level: 'elevated', spikeFlag: false, persistenceFlag: false },
    }
    const r = recommendStrengthTarget({
      exercise: benchPress, prescription: rx, history: [session('2026-08-17', 175, 5, 3)], symptoms, today: TODAY,
    })
    expect(r.mode).toBe('increase')
  })
})

describe('last week vs most recent (§8)', () => {
  it('reports lastWeek when a session exists in the previous calendar week', () => {
    // TODAY is Mon 2026-08-24; the previous calendar week is 2026-08-17..2026-08-23
    const r = call([session('2026-08-19', 180, 5, 2), session('2026-08-12', 175, 5, 2)])
    expect(r.lastWeek?.date).toBe('2026-08-19')
  })

  it('reports lastWeek as null when the most recent session predates the previous week', () => {
    const r = call([session('2026-07-20', 175, 5, 2)])
    expect(r.lastWeek).toBeNull()
    expect(r.previous?.date).toBe('2026-07-20')
  })

  it('always reports the most recent session as previous regardless of age', () => {
    expect(call([session('2026-02-02', 165, 5, 2)]).previous?.date).toBe('2026-02-02')
  })
})

describe('determinism and non-destructiveness', () => {
  it('returns an identical result for identical input', () => {
    const history = [session('2026-08-17', 175, 5, 2)]
    expect(call(history)).toEqual(call(history))
  })

  it('does not mutate the supplied history', () => {
    const history = [session('2026-08-17', 175, 5, 2)]
    const snapshot = structuredClone(history)
    call(history)
    expect(history).toEqual(snapshot)
  })

  it('never increases a station load because the increment is zero', () => {
    const sled: Exercise = { ...squat, id: 'ex_sled', category: 'sled', progressionIncrement: 0, incrementUnit: 'kg', defaultUnit: 'kg' }
    const r = recommendStrengthTarget({
      exercise: sled, prescription: { targetLoad: 152, loadUnit: 'kg' },
      history: [{ date: '2026-08-17', prescribedSets: 6, prescribedRepMin: 1, completedSets: [{ weight: 152, unit: 'kg', reps: 1, rir: 3 }] }],
      symptoms: calm, today: TODAY,
    })
    expect(r.target).toEqual({ value: 152, unit: 'kg' })
  })
})

describe('increment unit conversion', () => {
  it('converts a kg increment into lb before adding it to an lb previous load', () => {
    // Buggy (unconverted) implementation would give 175 + 10 = 185 lb.
    // Correct implementation converts 10 kg into lb first: ~197.05 lb.
    // The two are unmistakably different, so this discriminates a dropped
    // convertLoad call from a correct one.
    const kgIncrementSquat: Exercise = { ...squat, id: 'ex_squat_kg_increment', progressionIncrement: 10, incrementUnit: 'kg' }
    const r = recommendStrengthTarget({
      exercise: kgIncrementSquat, prescription: rx,
      history: [session('2026-08-17', 175, 5, 2)], symptoms: calm, today: TODAY,
    })
    expect(r.mode).toBe('increase')
    expect(r.target).toEqual({ value: 175 + kgToLb(10), unit: 'lb' })
  })

  it('converts an lb increment into kg before adding it to a kg previous load (mirror case)', () => {
    // Buggy (unconverted) implementation would give 100 + 8 = 108 kg.
    // Correct implementation converts 8 lb into kg first: ~103.63 kg.
    const lbIncrementSquat: Exercise = { ...squat, id: 'ex_squat_lb_increment', defaultUnit: 'kg', progressionIncrement: 8, incrementUnit: 'lb' }
    const kgSession: StrengthSessionHistory = {
      date: '2026-08-17', prescribedSets: 4, prescribedRepMin: 5,
      completedSets: Array.from({ length: 4 }, () => ({ weight: 100, unit: 'kg' as const, reps: 5, rir: 2 })),
    }
    const r = recommendStrengthTarget({
      exercise: lbIncrementSquat, prescription: { targetLoad: 100, loadUnit: 'kg' },
      history: [kgSession], symptoms: calm, today: TODAY,
    })
    expect(r.mode).toBe('increase')
    expect(r.target).toEqual({ value: 100 + lbToKg(8), unit: 'kg' })
  })
})
