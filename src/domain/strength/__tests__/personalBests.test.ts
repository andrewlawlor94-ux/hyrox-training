import { describe, expect, it } from 'vitest'
import type { SessionPerformance } from '../oneRepMax'
import { computePersonalBests } from '../personalBests'

const sessions: SessionPerformance[] = [
  { date: '2026-08-03', sets: [{ weight: 175, reps: 5, unit: 'lb' }, { weight: 175, reps: 5, unit: 'lb' }] },
  { date: '2026-08-10', sets: [{ weight: 180, reps: 6, unit: 'lb' }, { weight: 180, reps: 4, unit: 'lb' }] },
  { date: '2026-08-17', sets: [{ weight: 190, reps: 3, unit: 'lb' }] },
]

describe('computePersonalBests', () => {
  const pb = computePersonalBests(sessions)

  it('finds the heaviest set with its date', () => {
    expect(pb.heaviestSet).toEqual({ weight: 190, reps: 3, unit: 'lb', date: '2026-08-17' })
  })

  it('finds the best estimated 1RM with its date', () => {
    // 180x6 -> 216.0 is the highest estimate here (190x3 -> 209.0)
    expect(pb.bestEstimated1RM?.date).toBe('2026-08-10')
    expect(pb.bestEstimated1RM?.value).toBeCloseTo(216, 1)
  })

  it('finds the most reps at or above a given weight', () => {
    expect(pb.mostRepsAtOrAbove(180)).toEqual({ reps: 6, date: '2026-08-10' })
  })

  it('returns null when no set reaches the requested weight', () => {
    expect(pb.mostRepsAtOrAbove(300)).toBeNull()
  })

  it('finds the highest volume session', () => {
    // 2026-08-03: 1750, 2026-08-10: 1800, 2026-08-17: 570
    expect(pb.bestVolumeSession).toEqual({ volume: 1800, unit: 'lb', date: '2026-08-10' })
  })

  it('returns all-null bests for no history', () => {
    const empty = computePersonalBests([])
    expect(empty.heaviestSet).toBeNull()
    expect(empty.bestEstimated1RM).toBeNull()
    expect(empty.bestVolumeSession).toBeNull()
    expect(empty.mostRepsAtOrAbove(100)).toBeNull()
  })

  it('keeps the earliest date when two sessions tie on the heaviest set', () => {
    const tied = computePersonalBests([
      { date: '2026-09-07', sets: [{ weight: 200, reps: 3, unit: 'lb' }] },
      { date: '2026-08-31', sets: [{ weight: 200, reps: 3, unit: 'lb' }] },
    ])
    expect(tied.heaviestSet?.date).toBe('2026-08-31')
  })
})
