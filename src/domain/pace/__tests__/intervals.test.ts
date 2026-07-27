import { describe, expect, it } from 'vitest'
import { splitPaceSecPerKm, summarizeSplits } from '../intervals'

const splits = [
  { kind: 'warmup' as const, durationSec: 600, distanceM: 1500 },
  { kind: 'work' as const, durationSec: 240, distanceM: 1000 },
  { kind: 'recovery' as const, durationSec: 120, distanceM: 300 },
  { kind: 'work' as const, durationSec: 250, distanceM: 1000 },
  { kind: 'recovery' as const, durationSec: 120, distanceM: 300 },
  { kind: 'work' as const, durationSec: 236, distanceM: 1000 },
  { kind: 'cooldown' as const, durationSec: 480, distanceM: 1200 },
]

describe('summarizeSplits', () => {
  const s = summarizeSplits(splits)

  it('counts only work reps', () => {
    expect(s.workCount).toBe(3)
  })

  it('sums work distance only', () => {
    expect(s.totalWorkDistanceM).toBe(3000)
  })

  it('sums total session distance across every kind', () => {
    expect(s.totalSessionDistanceM).toBe(6300)
  })

  it('sums work duration only', () => {
    expect(s.totalWorkDurationSec).toBe(726)
  })

  it('computes mean work pace from work splits only', () => {
    expect(s.meanWorkPaceSecPerKm).toBe(242) // 726 s over 3 km
  })

  it('reports fastest and slowest work pace', () => {
    expect(s.fastestWorkPaceSecPerKm).toBe(236)
    expect(s.slowestWorkPaceSecPerKm).toBe(250)
  })

  it('returns a zeroed summary with null paces for no splits', () => {
    expect(summarizeSplits([])).toEqual({
      workCount: 0, totalWorkDistanceM: 0, totalSessionDistanceM: 0,
      totalWorkDurationSec: 0, meanWorkPaceSecPerKm: null,
      fastestWorkPaceSecPerKm: null, slowestWorkPaceSecPerKm: null,
    })
  })

  it('ignores splits missing distance when computing pace but still counts them', () => {
    const s2 = summarizeSplits([
      { kind: 'work', durationSec: 240, distanceM: 1000 },
      { kind: 'work', durationSec: 120 },
    ])
    expect(s2.workCount).toBe(2)
    expect(s2.totalWorkDistanceM).toBe(1000)
    expect(s2.meanWorkPaceSecPerKm).toBe(240)
  })

  it('returns a null mean when no work split has both distance and duration', () => {
    expect(summarizeSplits([{ kind: 'work', durationSec: 120 }]).meanWorkPaceSecPerKm).toBeNull()
  })
})

describe('splitPaceSecPerKm', () => {
  it('computes a single split pace', () => {
    expect(splitPaceSecPerKm({ distanceM: 1000, durationSec: 380 })).toBe(380)
  })

  it('returns null when distance is missing', () => {
    expect(splitPaceSecPerKm({ durationSec: 380 })).toBeNull()
  })

  it('returns null when duration is missing', () => {
    expect(splitPaceSecPerKm({ distanceM: 1000 })).toBeNull()
  })
})
