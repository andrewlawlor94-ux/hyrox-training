import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/data/types'
import { evaluateMilestones } from '@/domain/milestones/evaluate'
import { goalTargets } from '@/domain/milestones/goalTargets'
import { estimateRaceRange } from '@/domain/milestones/trajectory'
import { buildMilestoneFacts } from '../homeFacts'
import type { HomeFactsInput } from '../homeFacts'

const TARGETS = goalTargets(5700)

const BASE_INPUT: HomeFactsInput = {
  today: '2026-06-01',
  planStartDate: '2026-01-05',
  totalWeeks: 24,
  instances: [],
  templatesById: new Map(),
  runLogs: [],
  stationLogs: [],
  standardsByStation: new Map(),
  symptomsFlagged: false,
}

function runLog(overrides: Partial<RunLog> & Pick<RunLog, 'id' | 'runType' | 'distanceKm' | 'durationSec'>): RunLog {
  return {
    instanceId: 'wi_1', surface: 'road', notes: '', loggedAt: '2026-03-01T08:00:00.000Z',
    ...overrides,
  }
}

/** Six genuinely valid compromised-km efforts, well under target pace. */
function validCompromisedLogs(): RunLog[] {
  return Array.from({ length: 6 }, (_, i) => runLog({
    id: `rl_valid_${String(i)}`, runType: 'compromised', distanceKm: 1, durationSec: 390,
  }))
}

describe('buildMilestoneFacts: zero/invalid run values never poison a mean or an estimate (I1)', () => {
  it('a zero-distance compromised-km log is excluded from the mean rather than producing NaN or Infinity', () => {
    const poisoned = runLog({ id: 'rl_poison', runType: 'compromised', distanceKm: 0, durationSec: 300 })
    const facts = buildMilestoneFacts({ ...BASE_INPUT, runLogs: [...validCompromisedLogs(), poisoned] })

    expect(facts.compromisedKmMeanSec).not.toBeNull()
    expect(Number.isFinite(facts.compromisedKmMeanSec)).toBe(true)
    // The mean of six valid 390s/km efforts is exactly 390 — the poisoned
    // zero-distance row must contribute nothing to it.
    expect(facts.compromisedKmMeanSec).toBe(390)
  })

  it('a negative-duration compromised-km log is likewise excluded from the mean', () => {
    const poisoned = runLog({ id: 'rl_poison', runType: 'compromised', distanceKm: 1, durationSec: -100 })
    const facts = buildMilestoneFacts({ ...BASE_INPUT, runLogs: [...validCompromisedLogs(), poisoned] })
    expect(facts.compromisedKmMeanSec).toBe(390)
  })

  it('estimateRaceRange never prints a range from a single logged (or otherwise under-threshold) compromised km', () => {
    const oneLog = runLog({ id: 'rl_one', runType: 'compromised', distanceKm: 1, durationSec: 390 })
    const facts = buildMilestoneFacts({
      ...BASE_INPUT,
      runLogs: [
        oneLog,
        runLog({ id: 'rl_5k', runType: 'benchmark', distanceKm: 5, durationSec: 1700 }),
      ],
    })
    // Real evidence exists for the 5k benchmark and the mean pace is
    // computed — but only one compromised km has ever been logged, well
    // under the domain's own required count of six.
    expect(facts.compromisedKmMeanSec).not.toBeNull()
    expect(facts.best5kSeconds).not.toBeNull()

    const estimate = estimateRaceRange({ ...facts, seventyFiveSimulationDone: true }, TARGETS)
    expect(estimate).toBeNull()
  })

  it('estimateRaceRange does print a range once six genuinely valid compromised-km efforts exist', () => {
    const facts = buildMilestoneFacts({
      ...BASE_INPUT,
      runLogs: [
        ...validCompromisedLogs(),
        runLog({ id: 'rl_5k', runType: 'benchmark', distanceKm: 5, durationSec: 1700 }),
      ],
    })
    const estimate = estimateRaceRange({ ...facts, seventyFiveSimulationDone: true }, TARGETS)
    expect(estimate).not.toBeNull()
    expect(Number.isFinite(estimate?.lowSeconds)).toBe(true)
    expect(Number.isFinite(estimate?.highSeconds)).toBe(true)
  })
})

describe('buildMilestoneFacts: a zero-duration benchmark cannot achieve the standalone 5k milestone (I2)', () => {
  it('best5kSeconds ignores a 5 km / 0 s log entirely, rather than reporting 0', () => {
    const facts = buildMilestoneFacts({
      ...BASE_INPUT,
      runLogs: [runLog({ id: 'rl_zero', runType: 'benchmark', distanceKm: 5, durationSec: 0 })],
    })
    expect(facts.best5kSeconds).toBeNull()
  })

  it('a real subsequent benchmark still counts once the zero-duration row is excluded', () => {
    const facts = buildMilestoneFacts({
      ...BASE_INPUT,
      runLogs: [
        runLog({ id: 'rl_zero', runType: 'benchmark', distanceKm: 5, durationSec: 0 }),
        runLog({ id: 'rl_real', runType: 'benchmark', distanceKm: 5, durationSec: 1700 }),
      ],
    })
    expect(facts.best5kSeconds).toBe(1700)
  })

  it('the standalone5k milestone is not achieved from a 5 km / 0 s log alone', () => {
    // Week 1 of the plan (rather than BASE_INPUT's later week) so a
    // not-yet-achieved status reports as `notStarted`, not `atRisk` from an
    // unrelated target-week rule — this test is only about achieved vs. not.
    const facts = buildMilestoneFacts({
      ...BASE_INPUT,
      today: '2026-01-05',
      runLogs: [runLog({ id: 'rl_zero', runType: 'benchmark', distanceKm: 5, durationSec: 0 })],
    })
    const result = evaluateMilestones(facts, TARGETS).find((r) => r.key === 'standalone5k')
    expect(result?.status).not.toBe('achieved')
    expect(result?.status).toBe('notStarted')
  })
})
