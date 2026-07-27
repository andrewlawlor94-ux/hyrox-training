import { describe, expect, it } from 'vitest'
import type { SymptomLog } from '@/domain/types'
import { evaluateSymptoms, levelFor } from '../evaluate'

let seq = 0
function log(forDate: string, shin: number, sciatic: number, rpe = 6): SymptomLog {
  seq += 1
  return {
    id: `sym_${String(seq)}`, forDate, shinPain: shin, sciaticPain: sciatic,
    sessionRpe: rpe, notes: '', loggedAt: `${forDate}T18:00:00.000Z`,
  }
}

const TODAY = '2026-09-01'

describe('levelFor', () => {
  it.each([[0, 'green'], [2, 'green'], [3, 'caution'], [4, 'caution'], [5, 'elevated'], [10, 'elevated']] as const)(
    'maps %i to %s', (score, expected) => { expect(levelFor(score)).toBe(expected) },
  )
})

describe('levels', () => {
  it('reports green for a calm latest value', () => {
    expect(evaluateSymptoms([log('2026-08-31', 1, 0)], TODAY).shin.level).toBe('green')
  })

  it('reports caution at 3', () => {
    expect(evaluateSymptoms([log('2026-08-31', 3, 0)], TODAY).shin.level).toBe('caution')
  })

  it('reports elevated at 5', () => {
    expect(evaluateSymptoms([log('2026-08-31', 5, 0)], TODAY).shin.level).toBe('elevated')
  })

  it('reports green with no logs at all', () => {
    const s = evaluateSymptoms([], TODAY)
    expect(s.shin.level).toBe('green')
    expect(s.shin.latest).toBeNull()
    expect(s.shin.baseline).toBeNull()
    expect(s.anyFlag).toBe(false)
  })
})

describe('spike flag (D13)', () => {
  it('flags a rise of two or more points above the baseline of the prior five logs', () => {
    // baseline over logs 2..6 = mean(1,1,0,1,1) = 0.8; latest 3 -> delta 2.2
    const logs = [
      log('2026-08-31', 3, 0), log('2026-08-29', 1, 0), log('2026-08-27', 1, 0),
      log('2026-08-25', 0, 0), log('2026-08-23', 1, 0), log('2026-08-21', 1, 0),
    ]
    const s = evaluateSymptoms(logs, TODAY)
    expect(s.shin.baseline).toBeCloseTo(0.8, 6)
    expect(s.shin.spikeFlag).toBe(true)
    expect(s.shin.reasons).toContain('Shin pain is 2.2 points above your recent baseline.')
  })

  it('does not flag a rise below two points', () => {
    const logs = [
      log('2026-08-31', 2, 0), log('2026-08-29', 1, 0), log('2026-08-27', 1, 0),
      log('2026-08-25', 1, 0), log('2026-08-23', 1, 0),
    ]
    expect(evaluateSymptoms(logs, TODAY).shin.spikeFlag).toBe(false)
  })

  it('flags exactly at the two-point boundary (>=, not >)', () => {
    // baseline over logs 2..6 = mean(1,1,1,1,1) = 1; latest 3 -> delta exactly 2
    const logs = [
      log('2026-08-31', 3, 0), log('2026-08-29', 1, 0), log('2026-08-27', 1, 0),
      log('2026-08-25', 1, 0), log('2026-08-23', 1, 0), log('2026-08-21', 1, 0),
    ]
    const s = evaluateSymptoms(logs, TODAY)
    expect(s.shin.baseline).toBeCloseTo(1, 6)
    expect(s.shin.spikeFlag).toBe(true)
  })

  it('does not flag without the minimum baseline samples', () => {
    const logs = [log('2026-08-31', 5, 0), log('2026-08-29', 0, 0)]
    const s = evaluateSymptoms(logs, TODAY)
    expect(s.shin.baseline).toBeNull()
    expect(s.shin.spikeFlag).toBe(false)
  })

  it('excludes the latest log from its own baseline', () => {
    const logs = [
      log('2026-08-31', 6, 0), log('2026-08-29', 0, 0), log('2026-08-27', 0, 0), log('2026-08-25', 0, 0),
    ]
    expect(evaluateSymptoms(logs, TODAY).shin.baseline).toBe(0)
  })
})

describe('persistence flag', () => {
  it('flags three consecutive logs at three or above', () => {
    const logs = [log('2026-08-31', 3, 0), log('2026-08-29', 4, 0), log('2026-08-27', 3, 0)]
    const s = evaluateSymptoms(logs, TODAY)
    expect(s.shin.persistenceFlag).toBe(true)
    expect(s.shin.reasons).toContain('Shin pain has been 3 or higher for 3 workouts in a row.')
  })

  it('does not flag when the streak is broken', () => {
    const logs = [log('2026-08-31', 3, 0), log('2026-08-29', 1, 0), log('2026-08-27', 3, 0)]
    expect(evaluateSymptoms(logs, TODAY).shin.persistenceFlag).toBe(false)
  })

  it('does not flag with only two qualifying logs', () => {
    expect(evaluateSymptoms([log('2026-08-31', 4, 0), log('2026-08-29', 4, 0)], TODAY).shin.persistenceFlag).toBe(false)
  })

  it('tracks the two streams independently', () => {
    const logs = [log('2026-08-31', 0, 3), log('2026-08-29', 0, 4), log('2026-08-27', 0, 5)]
    const s = evaluateSymptoms(logs, TODAY)
    expect(s.sciatic.persistenceFlag).toBe(true)
    expect(s.shin.persistenceFlag).toBe(false)
  })
})

describe('series and windowing', () => {
  it('returns the series in ascending date order for charting', () => {
    const logs = [log('2026-08-31', 2, 1), log('2026-08-25', 1, 0), log('2026-08-29', 3, 2)]
    expect(evaluateSymptoms(logs, TODAY).shin.series.map((p) => p.date))
      .toEqual(['2026-08-25', '2026-08-29', '2026-08-31'])
  })

  it('excludes logs outside the window from the series', () => {
    const logs = [log('2026-08-31', 2, 1), log('2026-01-05', 9, 9)]
    const s = evaluateSymptoms(logs, TODAY, 90)
    expect(s.shin.series).toHaveLength(1)
  })

  it('still uses only in-window logs for flags', () => {
    // Guards against filtering the chart series but forgetting to filter the
    // logs that feed the flag computation. The previous fixture used only 2
    // logs total (1 in-window + 1 stale), so baselineSamples.length was 1
    // either way -- baseline was null and no spike could ever fire, whether
    // or not windowing was applied to flags. That could not catch the bug it
    // was meant to guard against.
    //
    // This fixture has 3 in-window baseline logs (enough on their own to
    // clear SYMPTOM_BASELINE_MIN_SAMPLES) plus one very stale, high-value
    // log. Correctly windowed: baseline = mean(1,1,1) = 1, delta = 5-1 = 4,
    // so spikeFlag fires. If the stale log leaked into the baseline pool
    // (i.e. flags computed from unwindowed logs): baseline = mean(1,1,1,10)
    // = 3.25, delta = 1.75, and the flag would NOT fire. The two behaviors
    // genuinely diverge, so this fixture proves windowing is applied before
    // flag computation, not just before charting.
    const logs = [
      log('2026-08-31', 5, 0), log('2026-08-29', 1, 0), log('2026-08-27', 1, 0),
      log('2026-08-25', 1, 0), log('2026-01-05', 10, 0),
    ]
    const s = evaluateSymptoms(logs, TODAY, 90)
    expect(s.shin.baseline).toBeCloseTo(1, 6)
    expect(s.shin.spikeFlag).toBe(true)
  })
})

describe('aggregate state', () => {
  it('reports anyFlag when either stream is flagged', () => {
    const logs = [log('2026-08-31', 0, 3), log('2026-08-29', 0, 4), log('2026-08-27', 0, 3)]
    expect(evaluateSymptoms(logs, TODAY).anyFlag).toBe(true)
  })

  it('computes the mean session RPE across the window', () => {
    const logs = [log('2026-08-31', 0, 0, 6), log('2026-08-29', 0, 0, 8)]
    expect(evaluateSymptoms(logs, TODAY).meanSessionRpe).toBe(7)
  })

  it('requests the red flag screen when sciatic reaches five (D11)', () => {
    expect(evaluateSymptoms([log('2026-08-31', 0, 5)], TODAY).needsRedFlagScreen).toBe(true)
  })

  it('requests the red flag screen when the sciatic stream is flagged', () => {
    const logs = [log('2026-08-31', 0, 3), log('2026-08-29', 0, 3), log('2026-08-27', 0, 4)]
    expect(evaluateSymptoms(logs, TODAY).needsRedFlagScreen).toBe(true)
  })

  it('does not request the screen for shin symptoms alone', () => {
    expect(evaluateSymptoms([log('2026-08-31', 8, 0)], TODAY).needsRedFlagScreen).toBe(false)
  })
})

describe('purity', () => {
  it('does not mutate the input array', () => {
    const logs = [log('2026-08-31', 2, 1), log('2026-08-25', 1, 0)]
    const snapshot = structuredClone(logs)
    evaluateSymptoms(logs, TODAY)
    expect(logs).toEqual(snapshot)
  })
})
