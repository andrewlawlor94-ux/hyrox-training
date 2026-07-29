import { describe, expect, it } from 'vitest'
import { reanchorToRaceDate } from '../reanchor'

// 2026-08-17 is a Monday; 2027-01-25 is the Monday 24 weeks after it, so a
// race anywhere in that week leaves a 24-week plan exactly aligned.
const START = '2026-08-17'
const WEEKS = 24
const ALIGNED_RACE_WEEK_MONDAY = '2027-01-25'

describe('reanchorToRaceDate', () => {
  it('reports no change when the final week already lands on race week', () => {
    const decision = reanchorToRaceDate({ currentStartDate: START, weeksCount: WEEKS, raceDate: ALIGNED_RACE_WEEK_MONDAY })
    expect(decision.outcome).toBe('alreadyAligned')
    expect(decision.startDate).toBe(START)
    expect(decision.shiftedWeeks).toBe(0)
  })

  it('is anchored to race WEEK, not race day: any day of that week is aligned', () => {
    // Saturday of the same ISO week.
    const decision = reanchorToRaceDate({ currentStartDate: START, weeksCount: WEEKS, raceDate: '2027-01-30' })
    expect(decision.outcome).toBe('alreadyAligned')
  })

  it('shifts the start later by exactly the weeks the race moved, so the taper stays on race week', () => {
    // Race pushed back three weeks.
    const decision = reanchorToRaceDate({ currentStartDate: START, weeksCount: WEEKS, raceDate: '2027-02-15' })
    expect(decision.outcome).toBe('startShiftedLater')
    expect(decision.shiftedWeeks).toBe(3)
    expect(decision.startDate).toBe('2026-09-07')
    // The invariant itself: start + (weeksCount - 1) weeks == race week Monday.
    expect(decision.explanation).toContain('3 weeks')
  })

  it('pluralises a one-week shift correctly', () => {
    const decision = reanchorToRaceDate({ currentStartDate: START, weeksCount: WEEKS, raceDate: '2027-02-01' })
    expect(decision.shiftedWeeks).toBe(1)
    expect(decision.explanation).toContain('1 week to keep')
  })

  // The whole reason this function only moves one direction. Pulling the start
  // backwards would drag plan weeks into the past, where `attemptOwnWeek` finds
  // no candidate days and the sessions in them are dropped rather than moved.
  it('never moves the start earlier when the race moves closer', () => {
    const decision = reanchorToRaceDate({ currentStartDate: START, weeksCount: WEEKS, raceDate: '2026-12-05' })
    expect(decision.outcome).toBe('raceMovedCloser')
    expect(decision.startDate).toBe(START)
    expect(decision.shiftedWeeks).toBe(0)
    expect(decision.explanation).toMatch(/closer/i)
  })

  it('always explains itself, in every outcome', () => {
    const races = [ALIGNED_RACE_WEEK_MONDAY, '2027-02-15', '2026-12-05']
    for (const raceDate of races) {
      const decision = reanchorToRaceDate({ currentStartDate: START, weeksCount: WEEKS, raceDate })
      expect(decision.explanation.length).toBeGreaterThan(0)
    }
  })

  it('is pure: identical input always yields an identical decision', () => {
    const args = { currentStartDate: START, weeksCount: WEEKS, raceDate: '2027-02-15' }
    expect(reanchorToRaceDate(args)).toEqual(reanchorToRaceDate(args))
  })
})
