import { describe, expect, it } from 'vitest'
import type { MilestoneFacts, MilestoneResult } from '../evaluate'
import { evaluateMilestones } from '../evaluate'
import { goalTargets } from '../goalTargets'
import type { MilestoneKey } from '../constants'

/** Defaults everything to "nothing achieved yet" — override per test. */
function facts(overrides: Partial<MilestoneFacts> = {}): MilestoneFacts {
  return {
    currentWeek: 1,
    totalWeeks: 24,
    weeksWithFourPlusSessions: 0,
    weeklyRunKm: [],
    longestContinuousRunKm: 0,
    best5kSeconds: null,
    compromisedKmMeanSec: null,
    compromisedKmCount: 0,
    raceLoadSledSessions: 0,
    hundredWallBallSessions: 0,
    halfSimulationDone: false,
    seventyFiveSimulationDone: false,
    fullRehearsalDone: false,
    symptomsFlagged: false,
    ...overrides,
  }
}

// Default 1:35 goal throughout: compromisedKmTargetSec ~397.5, standalone5kTargetSec ~1762.5.
const TARGETS = goalTargets(5700)

function pick(results: MilestoneResult[], key: MilestoneKey): MilestoneResult {
  const result = results.find((r) => r.key === key)
  if (!result) throw new Error(`missing milestone ${key}`)
  return result
}

describe('evaluateMilestones', () => {
  it('returns all twelve milestones in the fixed §18 order', () => {
    const results = evaluateMilestones(facts(), TARGETS)
    expect(results.map((r) => r.key)).toEqual([
      'fourWorkoutWeeks', 'weeklyRunningDistance', 'longestContinuousRun', 'comfortable10k',
      'standalone5k', 'compromisedKmSet', 'raceLoadSled', 'hundredWallBall',
      'halfSimulation', 'seventyFiveSimulation', 'fullRehearsal', 'symptomsManageable',
    ])
  })

  it('order is stable across repeated calls with different facts', () => {
    const a = evaluateMilestones(facts(), TARGETS).map((r) => r.key)
    const b = evaluateMilestones(facts({ symptomsFlagged: true }), TARGETS).map((r) => r.key)
    expect(a).toEqual(b)
  })

  describe('standalone5k', () => {
    it('is notStarted with no time logged', () => {
      expect(pick(evaluateMilestones(facts(), TARGETS), 'standalone5k').status).toBe('notStarted')
    })

    it('is achieved at or under the goal-derived target', () => {
      const r = pick(evaluateMilestones(facts({ best5kSeconds: 1762 }), TARGETS), 'standalone5k')
      expect(r.status).toBe('achieved')
    })

    it('is inProgress when a time exists but is slower than target', () => {
      const r = pick(evaluateMilestones(facts({ best5kSeconds: 1800 }), TARGETS), 'standalone5k')
      expect(r.status).toBe('inProgress')
    })
  })

  describe('compromisedKmSet', () => {
    it('is achieved only once count >= 6 AND mean pace is under target', () => {
      const r = pick(evaluateMilestones(facts({ compromisedKmCount: 6, compromisedKmMeanSec: 390 }), TARGETS), 'compromisedKmSet')
      expect(r.status).toBe('achieved')
    })

    it('is inProgress with five qualifying efforts even though the pace already meets target', () => {
      const r = pick(evaluateMilestones(facts({ compromisedKmCount: 5, compromisedKmMeanSec: 390 }), TARGETS), 'compromisedKmSet')
      expect(r.status).toBe('inProgress')
    })

    it('is inProgress with six efforts logged but the mean pace still too slow', () => {
      const r = pick(evaluateMilestones(facts({ compromisedKmCount: 6, compromisedKmMeanSec: 420 }), TARGETS), 'compromisedKmSet')
      expect(r.status).toBe('inProgress')
    })

    it('is notStarted with zero efforts logged', () => {
      const r = pick(evaluateMilestones(facts(), TARGETS), 'compromisedKmSet')
      expect(r.status).toBe('notStarted')
    })
  })

  describe('longestContinuousRun', () => {
    it('targets 12 km and reports the current value in its evidence', () => {
      const r = pick(evaluateMilestones(facts({ longestContinuousRunKm: 9 }), TARGETS), 'longestContinuousRun')
      expect(r.status).toBe('inProgress')
      expect(r.evidence.some((e) => e.value === '9.0 km')).toBe(true)
      expect(r.evidence.some((e) => e.target.includes('12.0 km'))).toBe(true)
    })

    it('is achieved at 12 km', () => {
      const r = pick(evaluateMilestones(facts({ longestContinuousRunKm: 12 }), TARGETS), 'longestContinuousRun')
      expect(r.status).toBe('achieved')
    })
  })

  describe('comfortable10k', () => {
    it('is not achieved just under 10 km', () => {
      const r = pick(evaluateMilestones(facts({ longestContinuousRunKm: 9.9 }), TARGETS), 'comfortable10k')
      expect(r.status).toBe('inProgress')
    })

    it('is achieved once the longest continuous run reaches 10 km', () => {
      const r = pick(evaluateMilestones(facts({ longestContinuousRunKm: 10 }), TARGETS), 'comfortable10k')
      expect(r.status).toBe('achieved')
    })
  })

  describe('fourWorkoutWeeks', () => {
    it('is inProgress below 4 qualifying weeks', () => {
      const r = pick(evaluateMilestones(facts({ weeksWithFourPlusSessions: 3 }), TARGETS), 'fourWorkoutWeeks')
      expect(r.status).toBe('inProgress')
    })

    it('is achieved at 4 qualifying weeks', () => {
      const r = pick(evaluateMilestones(facts({ weeksWithFourPlusSessions: 4 }), TARGETS), 'fourWorkoutWeeks')
      expect(r.status).toBe('achieved')
    })
  })

  describe('symptomsManageable', () => {
    it('is atRisk when symptoms are flagged', () => {
      const r = pick(evaluateMilestones(facts({ symptomsFlagged: true }), TARGETS), 'symptomsManageable')
      expect(r.status).toBe('atRisk')
    })

    it('is achieved when no symptoms are flagged', () => {
      const r = pick(evaluateMilestones(facts({ symptomsFlagged: false }), TARGETS), 'symptomsManageable')
      expect(r.status).toBe('achieved')
    })

    // symptomsManageable's targetWeek (24) must not, on its own, make a
    // healthy athlete atRisk just because the plan's final week has (or
    // hasn't) arrived — only the live symptom flag decides atRisk-ness.
    // The generic target-week-passed rule only escalates a *non-achieved*
    // status; an unflagged athlete is always 'achieved', so it is never
    // reachable here regardless of week.
    it('is not atRisk merely because week 24 has arrived, when unflagged', () => {
      const r = pick(evaluateMilestones(facts({ currentWeek: 24, symptomsFlagged: false }), TARGETS), 'symptomsManageable')
      expect(r.status).toBe('achieved')
    })

    it('is not atRisk merely because week 24 has not yet arrived, when unflagged', () => {
      const r = pick(evaluateMilestones(facts({ currentWeek: 1, symptomsFlagged: false }), TARGETS), 'symptomsManageable')
      expect(r.status).toBe('achieved')
    })

    it('stays atRisk when flagged, even long after week 24', () => {
      const r = pick(evaluateMilestones(facts({ currentWeek: 30, symptomsFlagged: true }), TARGETS), 'symptomsManageable')
      expect(r.status).toBe('atRisk')
    })
  })

  describe('simulation milestones', () => {
    it('map their booleans onto achieved/notStarted, with the specified target weeks', () => {
      const results = evaluateMilestones(facts({ halfSimulationDone: true }), TARGETS)
      const half = pick(results, 'halfSimulation')
      const seventyFive = pick(results, 'seventyFiveSimulation')
      const full = pick(results, 'fullRehearsal')
      expect(half.status).toBe('achieved')
      expect(half.targetWeek).toBe(12)
      expect(seventyFive.status).toBe('notStarted')
      expect(seventyFive.targetWeek).toBe(18)
      expect(full.status).toBe('notStarted')
      expect(full.targetWeek).toBe(21)
    })
  })

  it('every milestone carries at least one evidence row with a non-empty target string', () => {
    const results = evaluateMilestones(facts(), TARGETS)
    for (const result of results) {
      expect(result.evidence.length).toBeGreaterThan(0)
      for (const row of result.evidence) {
        expect(row.target.length).toBeGreaterThan(0)
      }
    }
  })

  describe('target-week risk escalation', () => {
    it('reports atRisk once a milestone\'s target week has passed without achievement', () => {
      // standalone5k targets week 12 (the plan's own benchmark week). Nothing achieved by week 13.
      const r = pick(evaluateMilestones(facts({ currentWeek: 13 }), TARGETS), 'standalone5k')
      expect(r.status).toBe('atRisk')
    })

    it('stays notStarted (not atRisk) before the target week passes', () => {
      const r = pick(evaluateMilestones(facts({ currentWeek: 12 }), TARGETS), 'standalone5k')
      expect(r.status).toBe('notStarted')
    })

    it('never demotes an already-achieved milestone, even long after its target week', () => {
      const r = pick(evaluateMilestones(facts({ currentWeek: 24, best5kSeconds: 1000 }), TARGETS), 'standalone5k')
      expect(r.status).toBe('achieved')
    })
  })

  it('does not mutate the facts object or its nested arrays', () => {
    const f = facts({ weeklyRunKm: [{ weekNumber: 1, km: 10 }, { weekNumber: 2, km: 15 }] })
    const snapshot = JSON.parse(JSON.stringify(f)) as MilestoneFacts
    evaluateMilestones(f, TARGETS)
    expect(f).toEqual(snapshot)
  })

  describe('weeklyRunningDistance (durability, absolute)', () => {
    it('reads the peak logged week, not the latest or a sum', () => {
      const r = pick(evaluateMilestones(facts({
        weeklyRunKm: [{ weekNumber: 1, km: 10 }, { weekNumber: 2, km: 28 }, { weekNumber: 3, km: 5 }],
      }), TARGETS), 'weeklyRunningDistance')
      expect(r.status).toBe('achieved')
    })

    it('is not achieved when the peak week stays under target', () => {
      const r = pick(evaluateMilestones(facts({
        weeklyRunKm: [{ weekNumber: 1, km: 10 }, { weekNumber: 2, km: 20 }],
      }), TARGETS), 'weeklyRunningDistance')
      expect(r.status).toBe('inProgress')
    })
  })

  describe('durability milestones do not scale with the goal (D15)', () => {
    it('longestContinuousRun, comfortable10k, and weeklyRunningDistance are unchanged when the goal time changes', () => {
      const f = facts({ longestContinuousRunKm: 11, weeklyRunKm: [{ weekNumber: 1, km: 20 }] })
      const slowGoal = evaluateMilestones(f, goalTargets(6000))
      const fastGoal = evaluateMilestones(f, goalTargets(5400))
      for (const key of ['longestContinuousRun', 'comfortable10k', 'weeklyRunningDistance'] as const) {
        expect(pick(slowGoal, key)).toEqual(pick(fastGoal, key))
      }
      // Sanity check the goal actually differs, so this test could fail if
      // the durability milestones ever started reading `targets`.
      expect(goalTargets(6000).standalone5kTargetSec).not.toBe(goalTargets(5400).standalone5kTargetSec)
    })
  })
})
