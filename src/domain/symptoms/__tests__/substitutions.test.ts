import { describe, expect, it } from 'vitest'
import type { SymptomState } from '../evaluate'
import { hasUrgentRedFlag, RED_FLAG_QUESTIONS, urgentRedFlagMessage } from '../redFlags'
import { suggestSubstitutions } from '../substitutions'

function state(over: Partial<SymptomState['shin']> = {}, sciatic: Partial<SymptomState['sciatic']> = {}): SymptomState {
  const blank = { latest: 0, baseline: 0, level: 'green' as const, spikeFlag: false, persistenceFlag: false, reasons: [], series: [] }
  return {
    shin: { ...blank, ...over }, sciatic: { ...blank, ...sciatic },
    meanSessionRpe: 6, anyFlag: false, needsRedFlagScreen: false,
  }
}

describe('suggestSubstitutions', () => {
  it('suggests nothing when both streams are calm', () => {
    expect(suggestSubstitutions(state())).toEqual([])
  })

  it('suggests impact reduction and low-impact swap for elevated shin pain', () => {
    const kinds = suggestSubstitutions(state({ latest: 6, level: 'elevated' })).map((s) => s.kind)
    expect(kinds).toContain('reduceImpactVolume')
    expect(kinds).toContain('swapHardRunForLowImpact')
    expect(kinds).toContain('maintainCalfTibialis')
    expect(kinds).toContain('holdLoadProgression')
  })

  it('mentions the 20-30% impact reduction range', () => {
    const s = suggestSubstitutions(state({ latest: 6, level: 'elevated' }))
    expect(s.find((x) => x.kind === 'reduceImpactVolume')?.detail).toMatch(/20[–-]30%/)
  })

  it('names SkiErg or rowing in the low-impact swap', () => {
    const s = suggestSubstitutions(state({ latest: 6, level: 'elevated' }))
    expect(s.find((x) => x.kind === 'swapHardRunForLowImpact')?.detail).toMatch(/SkiErg|row/i)
  })

  it('suggests assessment when a stream persists', () => {
    const kinds = suggestSubstitutions(state({ latest: 3, level: 'caution', persistenceFlag: true })).map((s) => s.kind)
    expect(kinds).toContain('seekAssessment')
  })

  it('suggests stopping the aggravating exercise for elevated sciatic symptoms', () => {
    const kinds = suggestSubstitutions(state({}, { latest: 7, level: 'elevated' })).map((s) => s.kind)
    expect(kinds).toContain('stopAggravatingExercise')
    expect(kinds).toContain('seekAssessment')
  })

  it('attributes each suggestion to the stream that caused it', () => {
    const s = suggestSubstitutions(state({ latest: 6, level: 'elevated' }))
    expect(s.every((x) => x.stream === 'shin')).toBe(true)
  })

  it('carries the non-diagnosis disclaimer on every suggestion', () => {
    const s = suggestSubstitutions(state({ latest: 6, level: 'elevated' }, { latest: 6, level: 'elevated' }))
    expect(s.length).toBeGreaterThan(0)
    expect(s.every((x) => x.disclaimer === 'Training-load suggestion, not a medical diagnosis.')).toBe(true)
  })

  it('produces no duplicate kinds for the same stream', () => {
    const s = suggestSubstitutions(state({ latest: 6, level: 'elevated', spikeFlag: true, persistenceFlag: true }))
    const keys = s.map((x) => `${x.stream}:${x.kind}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('dedupes seekAssessment for sciatic when both the persistence rule and the elevated rule fire', () => {
    // shin can never hit a duplicate kind through the current single-pass
    // if-block structure, so a shin-only fixture (as above) would pass even
    // with the Set deleted. The dedupe is only load-bearing for sciatic,
    // where seekAssessment is reachable via two independent rules at once:
    // persistenceFlag and level === 'elevated'.
    const kinds = suggestSubstitutions(state({}, { latest: 7, level: 'elevated', persistenceFlag: true }))
      .filter((s) => s.stream === 'sciatic' && s.kind === 'seekAssessment')
    expect(kinds).toHaveLength(1)
  })
})

describe('red flags', () => {
  it('offers exactly the three screening questions', () => {
    expect(RED_FLAG_QUESTIONS.map((q) => q.id)).toEqual(['bowelBladder', 'saddleNumbness', 'progressiveWeakness'])
  })

  it('is urgent when any answer is yes', () => {
    expect(hasUrgentRedFlag({ bowelBladder: true, saddleNumbness: false, progressiveWeakness: false })).toBe(true)
    expect(hasUrgentRedFlag({ bowelBladder: false, saddleNumbness: true, progressiveWeakness: false })).toBe(true)
    expect(hasUrgentRedFlag({ bowelBladder: false, saddleNumbness: false, progressiveWeakness: true })).toBe(true)
  })

  it('is not urgent when all answers are no', () => {
    expect(hasUrgentRedFlag({ bowelBladder: false, saddleNumbness: false, progressiveWeakness: false })).toBe(false)
  })

  it('directs the athlete to urgent assessment without diagnosing', () => {
    const msg = urgentRedFlagMessage()
    expect(msg).toMatch(/urgent/i)
    // Positive: carries explicit non-diagnostic framing.
    expect(msg).toMatch(/not a (medical )?diagnosis|safety prompt|not a judgment/i)
    // Negative: names no specific clinical condition.
    expect(msg).not.toMatch(/cauda equina|sciatica|herniat|stenosis|disc|nerve (damage|compression)|fracture/i)
  })

  it('makes same-day emergency assessment the unambiguous recommendation, not one option among several', () => {
    const msg = urgentRedFlagMessage()
    expect(msg).toMatch(/emergency/i)
    expect(msg).toMatch(/same-day|today/i)
    expect(msg).toMatch(/do not wait|rather than waiting|not wait/i)
  })
})
