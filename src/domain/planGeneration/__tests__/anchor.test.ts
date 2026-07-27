import { describe, expect, it } from 'vitest'
import { anchorPlan } from '../anchor'

const TODAY = '2026-07-27' // a Monday

describe('exactly 24 weeks available', () => {
  // 24 weeks from Mon 2026-07-27 puts race week starting 2027-01-04; race on Sat 2027-01-09
  const r = anchorPlan({ today: TODAY, raceDate: '2027-01-09' })

  it('starts the plan today', () => {
    expect(r.planStartDate).toBe('2026-07-27')
  })

  it('generates no base weeks', () => {
    expect(r.baseWeeks).toBe(0)
  })

  it('keeps all 24 core weeks', () => {
    expect(r.coreWeeks).toBe(24)
    expect(r.totalWeeks).toBe(24)
  })

  it('puts the race in week 24', () => {
    expect(r.raceWeekNumber).toBe(24)
  })

  it('raises no warnings', () => {
    expect(r.warnings).toEqual([])
  })
})

describe('fewer than 24 weeks available', () => {
  const r = anchorPlan({ today: TODAY, raceDate: '2026-11-14' }) // ~16 weeks out

  it('warns that the plan is short', () => {
    expect(r.warnings).toContain('shortPlan')
  })

  it('starts today rather than in the past', () => {
    expect(r.planStartDate).toBe('2026-07-27')
  })

  it('compresses the core weeks to fit', () => {
    expect(r.coreWeeks).toBeLessThan(24)
    expect(r.coreWeeks).toBeGreaterThan(0)
  })

  it('still anchors the race to the final week', () => {
    expect(r.raceWeekNumber).toBe(r.totalWeeks)
  })

  it('explains the compression in plain language', () => {
    expect(r.explanation).toMatch(/fewer than 24 weeks/i)
  })
})

describe('more than 24 weeks available, fillable with base weeks (D1)', () => {
  // ~30 weeks out -> 6 base weeks + 24 core
  const r = anchorPlan({ today: TODAY, raceDate: '2027-02-20' })

  it('starts the plan today so training begins immediately', () => {
    expect(r.planStartDate).toBe('2026-07-27')
  })

  it('generates base weeks to fill the gap', () => {
    expect(r.baseWeeks).toBeGreaterThan(0)
    expect(r.baseWeeks).toBeLessThanOrEqual(8)
  })

  it('keeps all 24 core weeks', () => {
    expect(r.coreWeeks).toBe(24)
  })

  it('anchors the race to the final week', () => {
    expect(r.raceWeekNumber).toBe(r.totalWeeks)
    expect(r.totalWeeks).toBe(r.baseWeeks + 24)
  })

  it('does not defer the start', () => {
    expect(r.deferredStartDate).toBeNull()
    expect(r.warnings).not.toContain('startDeferred')
  })

  it('explains the base weeks', () => {
    expect(r.explanation).toMatch(/base week/i)
  })
})

describe('far more than 24 + 8 weeks available', () => {
  const r = anchorPlan({ today: TODAY, raceDate: '2027-12-04' })

  it('caps base weeks at the maximum', () => {
    expect(r.baseWeeks).toBe(8)
  })

  it('defers the start so the taper still lands on race week', () => {
    expect(r.deferredStartDate).not.toBeNull()
    expect(r.warnings).toContain('startDeferred')
  })

  it('sets the plan start to the deferred date', () => {
    expect(r.planStartDate).toBe(r.deferredStartDate)
  })

  it('explains the countdown', () => {
    expect(r.explanation).toMatch(/begins on/i)
  })
})

describe('plan start is always a Monday', () => {
  it.each(['2026-07-27', '2026-07-28', '2026-07-30', '2026-08-01', '2026-08-02'])(
    'normalizes a today of %s to a Monday start', (today) => {
      const r = anchorPlan({ today, raceDate: '2027-02-20' })
      const day = new Date(`${r.planStartDate}T00:00:00.000Z`).getUTCDay()
      expect(day).toBe(1)
    },
  )
})

describe('race date in the past', () => {
  const r = anchorPlan({ today: TODAY, raceDate: '2026-06-01' })

  it('warns rather than throwing', () => {
    expect(r.warnings).toContain('raceInPast')
  })

  it('produces a usable single-week plan rather than a negative one', () => {
    expect(r.totalWeeks).toBeGreaterThanOrEqual(1)
  })
})

describe('purity', () => {
  it('is deterministic for identical input', () => {
    expect(anchorPlan({ today: TODAY, raceDate: '2027-02-20' }))
      .toEqual(anchorPlan({ today: TODAY, raceDate: '2027-02-20' }))
  })
})
