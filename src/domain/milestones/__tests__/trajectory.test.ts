import { describe, expect, it } from 'vitest'
import type { MilestoneFacts, MilestoneResult } from '../evaluate'
import { evaluateMilestones } from '../evaluate'
import { goalTargets } from '../goalTargets'
import { computeTrajectory, estimateRaceRange } from '../trajectory'

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

const TARGETS = goalTargets(5700)

/** Facts with every milestone fully achieved, at a given plan week. */
function allAchievedFacts(currentWeek: number): MilestoneFacts {
  return facts({
    currentWeek,
    weeksWithFourPlusSessions: 4,
    weeklyRunKm: [{ weekNumber: currentWeek, km: 28 }],
    longestContinuousRunKm: 12,
    best5kSeconds: 1700,
    compromisedKmMeanSec: 390,
    compromisedKmCount: 6,
    raceLoadSledSessions: 3,
    hundredWallBallSessions: 3,
    halfSimulationDone: true,
    seventyFiveSimulationDone: true,
    fullRehearsalDone: true,
    symptomsFlagged: false,
  })
}

function resultsFor(f: MilestoneFacts): MilestoneResult[] {
  return evaluateMilestones(f, TARGETS)
}

describe('computeTrajectory', () => {
  it('reports ahead when every milestone is met very early in the plan', () => {
    const f = allAchievedFacts(2) // week 2 of 24: expectedByNow = round(12*2/24) = 1
    const r = computeTrajectory(resultsFor(f), f)
    expect(r.trajectory).toBe('ahead')
  })

  it('reports onTrack when met count equals expected-by-week', () => {
    // week 14 of 24 -> expectedByNow = round(12*14/24) = 7. Achieve exactly 7
    // (six explicit milestones below, plus symptomsManageable which is
    // achieved by default whenever nothing is flagged).
    const f = facts({
      currentWeek: 14,
      weeksWithFourPlusSessions: 4, // fourWorkoutWeeks: achieved
      weeklyRunKm: [{ weekNumber: 14, km: 28 }], // weeklyRunningDistance: achieved
      longestContinuousRunKm: 12, // longestContinuousRun + comfortable10k: achieved (2)
      best5kSeconds: 1700, // standalone5k: achieved
      compromisedKmMeanSec: 390,
      compromisedKmCount: 6, // compromisedKmSet: achieved
      // raceLoadSled, hundredWallBall, and the three simulations are left at
      // their "nothing achieved" defaults.
    })
    const r = computeTrajectory(resultsFor(f), f)
    // met = fourWorkoutWeeks, weeklyRunningDistance, longestContinuousRun,
    // comfortable10k, standalone5k, compromisedKmSet, symptomsManageable = 7.
    // expected = 7.
    expect(r.trajectory).toBe('onTrack')
  })

  it('reports slightlyBehind when one milestone short of expected', () => {
    // Same as the onTrack case but drop compromisedKmSet to inProgress -> met = 6, expected = 7.
    const f = facts({
      currentWeek: 14,
      weeksWithFourPlusSessions: 4,
      weeklyRunKm: [{ weekNumber: 14, km: 28 }],
      longestContinuousRunKm: 12,
      best5kSeconds: 1700,
      compromisedKmMeanSec: 390,
      compromisedKmCount: 5, // inProgress, not achieved
    })
    const r = computeTrajectory(resultsFor(f), f)
    expect(r.trajectory).toBe('slightlyBehind')
  })

  it('reports needsAttention when several milestones short of expected', () => {
    // Nothing achieved except the default-true symptomsManageable milestone
    // at week 14 of 24 (expected = 7) -> met = 1, delta = -6.
    const f = facts({ currentWeek: 14 })
    const r = computeTrajectory(resultsFor(f), f)
    expect(r.trajectory).toBe('needsAttention')
  })

  it('rounds a fractional expected count up, not down (round-half-up at the .5 boundary)', () => {
    // Every other trajectory fixture in this file lands on an exact integer
    // expected-count (week 2 -> 1.0, week 14 -> 7.0), so none of them
    // exercise Math.round's behaviour exactly at .5. Week 13 of 24 does:
    // expectedByNow = round(12 * 13 / 24) = round(6.5).
    //
    // Deliberate choice: .5 rounds UP (more expected progress), not down.
    // This status tells the athlete whether to push or back off, and it is
    // safer to say "slightly behind" a beat early than "on track" a beat
    // too long — especially given running volume is this plan's main risk
    // for an athlete with a shin/sciatic history. `Math.round` already
    // rounds .5 up towards +Infinity for positive inputs in JavaScript, so
    // this confirms existing behaviour rather than changing it.
    //
    // This fixture achieves exactly 6 of 12 milestones (fourWorkoutWeeks,
    // weeklyRunningDistance, longestContinuousRun, comfortable10k,
    // standalone5k, and the default-achieved symptomsManageable). If
    // expectedByNow rounded 6.5 down to 6, delta would be 0 -> onTrack.
    // Rounding up to 7 gives delta -1 -> slightlyBehind, which is what this
    // test asserts.
    const f = facts({
      currentWeek: 13,
      weeksWithFourPlusSessions: 4,
      weeklyRunKm: [{ weekNumber: 13, km: 28 }],
      longestContinuousRunKm: 12,
      best5kSeconds: 1700,
    })
    const r = computeTrajectory(resultsFor(f), f)
    expect(r.trajectory).toBe('slightlyBehind')
  })

  it('caps an otherwise-ahead result at slightlyBehind when symptoms are flagged, and names the cap in evidence', () => {
    const f = allAchievedFacts(2)
    f.symptomsFlagged = true
    const r = computeTrajectory(resultsFor(f), f)
    expect(r.trajectory).toBe('slightlyBehind')
    expect(r.evidence.some((line) => /cap/i.test(line) && /symptom/i.test(line))).toBe(true)
  })

  it('caps an otherwise-onTrack result at slightlyBehind when symptoms are flagged', () => {
    const f = facts({
      currentWeek: 12,
      weeksWithFourPlusSessions: 4,
      weeklyRunKm: [{ weekNumber: 12, km: 28 }],
      longestContinuousRunKm: 12,
      best5kSeconds: 1700,
      compromisedKmMeanSec: 390,
      compromisedKmCount: 6,
      symptomsFlagged: true,
    })
    // met = 6 (as in the onTrack case above), expected = 6 -> would be onTrack, but flagged.
    const r = computeTrajectory(resultsFor(f), f)
    expect(r.trajectory).toBe('slightlyBehind')
  })

  it('does not improve an already-needsAttention result when symptoms are also flagged', () => {
    const f = facts({ currentWeek: 12, symptomsFlagged: true })
    const r = computeTrajectory(resultsFor(f), f)
    expect(r.trajectory).toBe('needsAttention')
  })

  it('evidence is never empty and names specific milestones rather than a bare status label', () => {
    const f = allAchievedFacts(2)
    const r = computeTrajectory(resultsFor(f), f)
    expect(r.evidence.length).toBeGreaterThan(0)
    expect(r.evidence.some((line) => line.includes('Standalone 5 km benchmark'))).toBe(true)
    expect(r.evidence).not.toContain('ahead')
    expect(r.evidence).not.toContain('onTrack')
  })

  it('headline never contains a predicted finishing time', () => {
    const f = allAchievedFacts(20)
    const r = computeTrajectory(resultsFor(f), f)
    // No colon-separated clock value (mm:ss / h:mm:ss) anywhere in the headline.
    expect(r.headline).not.toMatch(/\d{1,2}:\d{2}(:\d{2})?/)
  })
})

describe('estimateRaceRange', () => {
  const complete = facts({
    best5kSeconds: 1700,
    compromisedKmMeanSec: 400,
    seventyFiveSimulationDone: true,
  })

  it('returns a range when all three inputs are present', () => {
    const estimate = estimateRaceRange(complete, TARGETS)
    expect(estimate).not.toBeNull()
    expect(estimate?.lowSeconds).toBeGreaterThan(0)
    expect(estimate?.highSeconds).toBeGreaterThan(0)
    expect(estimate?.lowSeconds).toBeLessThan(estimate?.highSeconds ?? 0)
  })

  it('returns null when only the 5k benchmark and compromised mean exist (no 75% simulation)', () => {
    const f = facts({ best5kSeconds: 1700, compromisedKmMeanSec: 400, seventyFiveSimulationDone: false })
    expect(estimateRaceRange(f, TARGETS)).toBeNull()
  })

  it('returns null when only the 5k benchmark and the 75% simulation exist (no compromised mean)', () => {
    const f = facts({ best5kSeconds: 1700, compromisedKmMeanSec: null, seventyFiveSimulationDone: true })
    expect(estimateRaceRange(f, TARGETS)).toBeNull()
  })

  it('returns null when only the compromised mean and the 75% simulation exist (no 5k benchmark)', () => {
    const f = facts({ best5kSeconds: null, compromisedKmMeanSec: 400, seventyFiveSimulationDone: true })
    expect(estimateRaceRange(f, TARGETS)).toBeNull()
  })

  it('returns null with nothing at all present', () => {
    expect(estimateRaceRange(facts(), TARGETS)).toBeNull()
  })
})
