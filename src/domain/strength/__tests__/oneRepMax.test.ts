import { describe, expect, it } from 'vitest'
import type { SessionPerformance } from '../oneRepMax'
import { epley1RM, hasEnough1RMData, oneRepMaxTrend, sessionBest1RM } from '../oneRepMax'

describe('epley1RM', () => {
  it('returns the weight itself for a single rep', () => {
    expect(epley1RM(220, 1)).toBeCloseTo(220 * (1 + 1 / 30), 6)
  })

  it('estimates from a triple', () => {
    expect(epley1RM(220, 3)).toBeCloseTo(242, 0)
  })

  it('estimates from a set of five', () => {
    expect(epley1RM(175, 5)).toBeCloseTo(204.17, 2)
  })

  it('returns null above the rep ceiling because the formula loses validity', () => {
    expect(epley1RM(100, 13)).toBeNull()
  })

  it.each([[0, 5], [100, 0], [-100, 5], [100, -1], [Number.NaN, 5], [100, Number.NaN]])(
    'returns null for weight %s reps %s', (w, r) => { expect(epley1RM(w, r)).toBeNull() },
  )
})

describe('sessionBest1RM', () => {
  it('picks the highest estimate across the session, not the heaviest weight', () => {
    const session: SessionPerformance = {
      date: '2026-08-03',
      sets: [
        { weight: 200, reps: 1, unit: 'lb' },  // 206.7
        { weight: 175, reps: 8, unit: 'lb' },  // 221.7  <- best
        { weight: 185, reps: 5, unit: 'lb' },  // 215.8
      ],
    }
    expect(sessionBest1RM(session)).toBeCloseTo(221.67, 2)
  })

  it('ignores sets over the rep ceiling', () => {
    expect(sessionBest1RM({ date: '2026-08-03', sets: [{ weight: 100, reps: 20, unit: 'lb' }] })).toBeNull()
  })

  it('returns null for an empty session', () => {
    expect(sessionBest1RM({ date: '2026-08-03', sets: [] })).toBeNull()
  })
})

describe('hasEnough1RMData / oneRepMaxTrend', () => {
  const make = (date: string, weight: number): SessionPerformance =>
    ({ date, sets: [{ weight, reps: 5, unit: 'lb' }] })

  it('requires at least three qualifying sessions', () => {
    expect(hasEnough1RMData([make('2026-08-03', 175), make('2026-08-10', 180)])).toBe(false)
    expect(hasEnough1RMData([make('2026-08-03', 175), make('2026-08-10', 180), make('2026-08-17', 185)])).toBe(true)
  })

  it('does not count sessions that yield no estimate', () => {
    const unusable: SessionPerformance = { date: '2026-08-24', sets: [{ weight: 100, reps: 20, unit: 'lb' }] }
    expect(hasEnough1RMData([make('2026-08-03', 175), make('2026-08-10', 180), unusable])).toBe(false)
  })

  it('returns the trend in ascending date order', () => {
    const trend = oneRepMaxTrend([make('2026-08-17', 185), make('2026-08-03', 175), make('2026-08-10', 180)])
    expect(trend.map((p) => p.date)).toEqual(['2026-08-03', '2026-08-10', '2026-08-17'])
    expect(trend[0]?.estimated1RM).toBeCloseTo(204.17, 2)
  })

  it('omits sessions with no usable estimate from the trend', () => {
    const trend = oneRepMaxTrend([make('2026-08-03', 175), { date: '2026-08-10', sets: [] }])
    expect(trend).toHaveLength(1)
  })
})
