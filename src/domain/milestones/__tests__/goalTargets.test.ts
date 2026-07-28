import { describe, expect, it } from 'vitest'
import { goalTargets } from '../goalTargets'

describe('goalTargets', () => {
  it('derives a 6:00/km compromised target for a sub-1:30 goal, matching the brief', () => {
    expect(goalTargets(5400).compromisedKmTargetSec).toBe(360)
  })

  it('derives the default 1:35 targets', () => {
    const t = goalTargets(5700)
    expect(t.compromisedKmTargetSec).toBeCloseTo(397.5, 1)
    expect(t.standalone5kTargetSec).toBeCloseTo(1762.5, 1)
  })

  it('derives 1:40 targets', () => {
    const t = goalTargets(6000)
    expect(t.compromisedKmTargetSec).toBe(435)
    expect(t.standalone5kTargetSec).toBe(1950)
  })

  it('keeps the sub-1:30 5k target within the brief-stated 26:00-28:00 band (sanity bound)', () => {
    const t = goalTargets(5400)
    expect(t.standalone5kTargetSec).toBeGreaterThanOrEqual(1560)
    expect(t.standalone5kTargetSec).toBeLessThanOrEqual(1680)
  })

  it('reports the run budget', () => {
    expect(goalTargets(5700).runBudgetSec).toBe(3180)
  })

  it('recalculates when the goal changes', () => {
    expect(goalTargets(5400).standalone5kTargetSec).toBeLessThan(goalTargets(6000).standalone5kTargetSec)
  })

  it('honours an overridden station budget', () => {
    expect(goalTargets(5700, { stationBudgetSec: 2400 }).compromisedKmTargetSec).toBeCloseTo(412.5, 1)
  })

  it('honours an overridden compromised penalty', () => {
    expect(goalTargets(5700, { penaltySecPerKm: 30 }).standalone5kTargetSec).toBeCloseTo(1837.5, 1)
  })

  it('clamps to a positive run budget for an impossibly fast goal', () => {
    const t = goalTargets(1000)
    expect(t.compromisedKmTargetSec).toBeGreaterThan(0)
    expect(t.standalone5kTargetSec).toBeGreaterThan(0)
  })

  it('keeps the run budget itself sane at the clamp boundary (not just positive downstream values)', () => {
    // Regression guard: a clamp that only floors runBudgetSec at a tiny
    // epsilon (e.g. 1s) would satisfy "greater than 0" above while still
    // yielding a nonsensical compromised pace far outside anything runnable.
    // The floor must keep compromisedKmTargetSec strictly above the
    // penalty being subtracted from it.
    const t = goalTargets(1000)
    expect(t.compromisedKmTargetSec).toBeGreaterThan(45)
  })
})
