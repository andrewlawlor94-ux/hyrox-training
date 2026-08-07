import { describe, expect, it } from 'vitest'
import type { SymptomState } from '../evaluate'
import { hasUrgentRedFlag, RED_FLAG_QUESTIONS, urgentRedFlagMessage } from '../redFlags'
import { buildSymptomAdvice } from '../substitutions'
import type { SubstitutionKind, SymptomAdvice } from '../substitutions'

function state(over: Partial<SymptomState['shin']> = {}, sciatic: Partial<SymptomState['sciatic']> = {}): SymptomState {
  const blank = {
    latest: 0, baseline: 0, level: 'green' as const, spikeFlag: false, persistenceFlag: false,
    reasons: [], series: [],
  }
  return {
    shin: { ...blank, ...over }, sciatic: { ...blank, ...sciatic },
    meanSessionRpe: 6, anyFlag: false, needsRedFlagScreen: false,
  }
}

/** Every suggestion kind across every card, for the rules that do not care
 * which card carried them. */
function kindsIn(advice: SymptomAdvice[]): SubstitutionKind[] {
  return advice.flatMap((entry) => entry.items.map((item) => item.kind))
}

const ELEVATED_SHIN = state({ latest: 6, level: 'elevated' })

describe('buildSymptomAdvice', () => {
  it('suggests nothing when both streams are calm', () => {
    expect(buildSymptomAdvice(state())).toEqual([])
  })

  /**
   * The shape change the athlete's report forced: "the home tab has a crazy
   * amount of suggestions". One observation is one piece of news, so a stream's
   * suggestions became the bullet points of a single card rather than cards in
   * their own right — Home had been rendering each one once PER AFFECTED SESSION
   * across the whole remaining plan, which ran to hundreds.
   */
  it('returns at most one entry per stream, however many suggestions it carries', () => {
    const both = buildSymptomAdvice(state({ latest: 6, level: 'elevated' }, { latest: 7, level: 'elevated' }))
    expect(both).toHaveLength(2)
    expect(both.map((entry) => entry.stream)).toEqual(['shin', 'sciatic'])

    const shinOnly = buildSymptomAdvice(ELEVATED_SHIN)
    expect(shinOnly).toHaveLength(1)
    // ...and that one entry still carries all four shin suggestions.
    expect(shinOnly[0]?.items).toHaveLength(4)
  })

  it('suggests impact reduction and low-impact swap for elevated shin pain', () => {
    const kinds = kindsIn(buildSymptomAdvice(ELEVATED_SHIN))
    expect(kinds).toContain('reduceImpactVolume')
    expect(kinds).toContain('swapHardRunForLowImpact')
    expect(kinds).toContain('maintainCalfTibialis')
    expect(kinds).toContain('holdLoadProgression')
  })

  it('mentions the 20-30% impact reduction range', () => {
    const items = buildSymptomAdvice(ELEVATED_SHIN).flatMap((entry) => entry.items)
    expect(items.find((x) => x.kind === 'reduceImpactVolume')?.detail).toMatch(/20[–-]30%/)
  })

  it('names SkiErg or rowing in the low-impact swap', () => {
    const items = buildSymptomAdvice(ELEVATED_SHIN).flatMap((entry) => entry.items)
    expect(items.find((x) => x.kind === 'swapHardRunForLowImpact')?.detail).toMatch(/SkiErg|row/i)
  })

  it('suggests assessment when a stream persists', () => {
    const advice = buildSymptomAdvice(state({ latest: 3, level: 'caution', persistenceFlag: true }))
    expect(kindsIn(advice)).toContain('seekAssessment')
  })

  it('suggests stopping the aggravating exercise for elevated sciatic symptoms', () => {
    const kinds = kindsIn(buildSymptomAdvice(state({}, { latest: 7, level: 'elevated' })))
    expect(kinds).toContain('stopAggravatingExercise')
    expect(kinds).toContain('seekAssessment')
  })

  it('attributes each suggestion to the stream that caused it', () => {
    const advice = buildSymptomAdvice(ELEVATED_SHIN)
    expect(advice.map((entry) => entry.stream)).toEqual(['shin'])
    expect(advice.every((entry) => entry.items.every((item) => item.stream === entry.stream))).toBe(true)
  })

  it('carries the non-diagnosis disclaimer on every card and every suggestion', () => {
    const advice = buildSymptomAdvice(state({ latest: 6, level: 'elevated' }, { latest: 6, level: 'elevated' }))
    expect(advice.length).toBeGreaterThan(0)
    const disclaimer = 'Training-load suggestion, not a medical diagnosis.'
    expect(advice.every((entry) => entry.disclaimer === disclaimer)).toBe(true)
    expect(advice.every((entry) => entry.items.every((item) => item.disclaimer === disclaimer))).toBe(true)
  })

  /**
   * Only two kinds change anything in the plan. The other four were rendered
   * with an Accept button that called a function with no branch for them and
   * reported success — the athlete's "i also cant accept them as the button
   * doesn't work".
   */
  it('marks exactly the suggestions that can change the plan as actionable', () => {
    const advice = buildSymptomAdvice(state(
      { latest: 6, level: 'elevated' },
      { latest: 7, level: 'elevated', persistenceFlag: true },
    ))
    const items = advice.flatMap((entry) => entry.items)
    const actionable = items.filter((item) => item.actionable).map((item) => item.kind)
    expect(new Set(actionable)).toEqual(new Set(['reduceImpactVolume', 'swapHardRunForLowImpact']))

    const advisory: SubstitutionKind[] = ['maintainCalfTibialis', 'holdLoadProgression', 'seekAssessment', 'stopAggravatingExercise']
    for (const kind of advisory) {
      expect(items.find((x) => x.kind === kind)?.actionable, kind).toBe(false)
    }
  })

  /** "im not sure why it thinks i need these suggestions based on what i
   * logged" — the cards said what to do and never why. */
  it('states the observation that raised it, preferring the computed reason', () => {
    const plain = buildSymptomAdvice(state({ latest: 6, level: 'elevated', series: [{ date: '2026-08-06', value: 6 }] }))
    expect(plain[0]?.reason).toBe('You reported shin pain of 6 out of 10 on 2026-08-06.')
    expect(plain[0]?.triggeredOn).toBe('2026-08-06')

    const spiked = buildSymptomAdvice(state({
      latest: 6, level: 'elevated', spikeFlag: true,
      reasons: ['Shin pain is 3.0 points above your recent baseline.'],
    }))
    expect(spiked[0]?.reason).toBe('Shin pain is 3.0 points above your recent baseline.')
  })

  it('still names a reason when the stream has no dated report to point at', () => {
    const advice = buildSymptomAdvice(ELEVATED_SHIN)
    expect(advice[0]?.reason).toMatch(/6 out of 10/)
    expect(advice[0]?.triggeredOn).toBeNull()
  })

  it('produces no duplicate kinds within a card', () => {
    const advice = buildSymptomAdvice(state({ latest: 6, level: 'elevated', spikeFlag: true, persistenceFlag: true }))
    for (const entry of advice) {
      const kinds = entry.items.map((item) => item.kind)
      expect(new Set(kinds).size).toBe(kinds.length)
    }
  })

  it('dedupes seekAssessment for sciatic when both the persistence rule and the elevated rule fire', () => {
    // shin can never hit a duplicate kind through the current single-pass
    // if-block structure, so a shin-only fixture would pass even with the dedupe
    // deleted. It is only load-bearing for sciatic, where seekAssessment is
    // reachable via two independent rules at once.
    const advice = buildSymptomAdvice(state({}, { latest: 7, level: 'elevated', persistenceFlag: true }))
    const seek = advice.flatMap((entry) => entry.items).filter((x) => x.stream === 'sciatic' && x.kind === 'seekAssessment')
    expect(seek).toHaveLength(1)
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
