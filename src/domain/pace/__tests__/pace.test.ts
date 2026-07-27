import { describe, expect, it } from 'vitest'
import { paceSecPerKm, projectedTimeSec, speedKmh } from '../pace'

describe('paceSecPerKm', () => {
  it('computes pace for a valid run', () => {
    expect(paceSecPerKm(5, 1900)).toBe(380) // 31:40 over 5 km = 6:20/km
  })

  it('handles a fractional distance', () => {
    expect(paceSecPerKm(1.5, 570)).toBe(380)
  })

  it.each([
    ['zero distance', 0, 1900],
    ['negative distance', -5, 1900],
    ['zero duration', 5, 0],
    ['negative duration', 5, -100],
    ['NaN distance', Number.NaN, 1900],
    ['Infinity distance', Number.POSITIVE_INFINITY, 1900],
    ['NaN duration', 5, Number.NaN],
    ['Infinity duration', 5, Number.POSITIVE_INFINITY],
  ])('returns null for %s', (_label, km, sec) => {
    expect(paceSecPerKm(km, sec)).toBeNull()
  })

  it('never returns NaN or Infinity', () => {
    for (const [km, sec] of [[0, 0], [Number.NaN, Number.NaN], [1, Number.POSITIVE_INFINITY]] as const) {
      const result = paceSecPerKm(km, sec)
      expect(result === null || Number.isFinite(result)).toBe(true)
    }
  })
})

describe('speedKmh', () => {
  it('computes speed', () => {
    expect(speedKmh(10, 3600)).toBeCloseTo(10, 6)
  })

  it('returns null for invalid input', () => {
    expect(speedKmh(0, 3600)).toBeNull()
  })
})

describe('projectedTimeSec', () => {
  it('projects a finishing time from pace', () => {
    expect(projectedTimeSec(8, 398)).toBe(3184)
  })

  it('returns null for a non-positive pace', () => {
    expect(projectedTimeSec(8, 0)).toBeNull()
  })
})
