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
      totalSessionDurationSec: 0, totalWorkDurationSec: 0, meanWorkPaceSecPerKm: null,
      fastestWorkPaceSecPerKm: null, slowestWorkPaceSecPerKm: null,
    })
  })

  /**
   * The total an interval session is actually saved with. Every split counts
   * toward it — warm-up and cool-down included — which is exactly what makes it
   * different from `totalWorkDurationSec`.
   */
  it('totals every split\'s duration, not just the work reps', () => {
    const summary = summarizeSplits([
      { kind: 'warmup', durationSec: 300 },
      { kind: 'work', durationSec: 240, distanceM: 1000 },
      { kind: 'recovery', durationSec: 90 },
      { kind: 'work', durationSec: 250, distanceM: 1000 },
      { kind: 'cooldown', durationSec: 300 },
    ])
    expect(summary.totalSessionDurationSec).toBe(300 + 240 + 90 + 250 + 300)
    expect(summary.totalWorkDurationSec).toBe(240 + 250)
    // Warm-up and cool-down carry no distance, so the session distance is the
    // work distance here — but the DURATIONS differ, which is the point.
    expect(summary.totalSessionDistanceM).toBe(2000)
  })

  it('counts a split with no duration as contributing nothing, never NaN', () => {
    const summary = summarizeSplits([{ kind: 'work', distanceM: 1000 }, { kind: 'recovery' }])
    expect(summary.totalSessionDurationSec).toBe(0)
    expect(Number.isNaN(summary.totalSessionDurationSec)).toBe(false)
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

  // Guards the weighting rule specifically. Every other fixture here uses equal
  // 1000 m work splits, where summing-then-dividing and averaging the per-split
  // paces give the same answer — so those fixtures cannot catch a regression to
  // an average-of-averages. These splits are deliberately unequal:
  //   correct (total 700 s over 2.0 km) -> 350 s/km
  //   naive mean of 400 and 333.33      -> 366.67 s/km
  it('weights mean work pace by distance rather than averaging per-split paces', () => {
    const summary = summarizeSplits([
      { kind: 'work', distanceM: 500, durationSec: 200 },
      { kind: 'recovery', distanceM: 200, durationSec: 90 },
      { kind: 'work', distanceM: 1500, durationSec: 500 },
    ])
    expect(summary.meanWorkPaceSecPerKm).toBe(350)
    expect(summary.meanWorkPaceSecPerKm).not.toBeCloseTo(366.67, 1)
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
