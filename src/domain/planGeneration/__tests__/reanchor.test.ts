import { describe, expect, it } from 'vitest'
import { reanchorToRaceDate } from '../reanchor'
import { PLAN_WEEKS_DEFAULT } from '../constants'

// 2026-08-17 is a Monday; 2027-01-25 is the Monday 24 weeks later, so a plan of
// 24 core weeks and no base weeks starting there ends exactly on race week.
const START = '2026-08-17'
const ALIGNED_RACE_WEEK_MONDAY = '2027-01-25'

const base = {
  currentStartDate: START,
  baseWeeks: 0,
  currentCoreWeeks: PLAN_WEEKS_DEFAULT,
}

describe('reanchorToRaceDate', () => {
  it('reports no change when the plan already ends on race week', () => {
    const decision = reanchorToRaceDate({ ...base, raceDate: ALIGNED_RACE_WEEK_MONDAY })
    expect(decision.outcome).toBe('alreadyAligned')
    expect(decision.startDate).toBe(START)
    expect(decision.coreWeeks).toBe(PLAN_WEEKS_DEFAULT)
    expect(decision.shiftedWeeks).toBe(0)
  })

  it('is anchored to race WEEK, not race day: any day of that week is aligned', () => {
    // Saturday of the same ISO week.
    expect(reanchorToRaceDate({ ...base, raceDate: '2027-01-30' }).outcome).toBe('alreadyAligned')
  })

  /**
   * The defect the athlete hit: moving a race from 24 weeks out to 8 weeks out
   * used to leave the 24-week plan alone, so weeks 9-24 fell after race day and
   * were all auto-dropped — sixteen weeks the Plan tab then rendered as "Done".
   */
  it('COMPRESSES the core block when the race moves closer, instead of leaving weeks past race day', () => {
    // Eight weeks of runway from the plan's own start.
    const decision = reanchorToRaceDate({ ...base, raceDate: '2026-10-05' })
    expect(decision.outcome).toBe('compressed')
    expect(decision.coreWeeks).toBe(8)
    // The start does NOT move: pulling it earlier drags weeks into the past,
    // where placement finds no candidate day and sessions are dropped.
    expect(decision.startDate).toBe(START)
    expect(decision.explanation).toMatch(/8 core weeks/)
    expect(decision.explanation).toMatch(/taper still lands on race week/i)
  })

  it('counts base weeks against the runway, so they are never compressed away', () => {
    // Same eight weeks of runway, but three are generated Base weeks.
    const decision = reanchorToRaceDate({
      currentStartDate: START, baseWeeks: 3, currentCoreWeeks: PLAN_WEEKS_DEFAULT, raceDate: '2026-10-05',
    })
    expect(decision.outcome).toBe('compressed')
    expect(decision.coreWeeks).toBe(5) // 8 available - 3 base
  })

  it('never compresses below a single core week, however close the race is', () => {
    const decision = reanchorToRaceDate({ ...base, raceDate: START })
    expect(decision.coreWeeks).toBe(1)
    // Even a race in the PAST cannot produce zero or negative weeks.
    expect(reanchorToRaceDate({ ...base, raceDate: '2026-07-06' }).coreWeeks).toBe(1)
  })

  it('EXTENDS a previously compressed plan back out when the race moves later', () => {
    const decision = reanchorToRaceDate({
      currentStartDate: START, baseWeeks: 0, currentCoreWeeks: 8, raceDate: ALIGNED_RACE_WEEK_MONDAY,
    })
    expect(decision.outcome).toBe('extended')
    expect(decision.coreWeeks).toBe(PLAN_WEEKS_DEFAULT)
    expect(decision.explanation).toMatch(/further out/i)
  })

  it('never extends past the 24 weeks the seed actually contains', () => {
    // A race two years out: the core block stays at 24 and the START moves
    // instead, because there are no weeks 25+ to generate.
    const decision = reanchorToRaceDate({ ...base, raceDate: '2028-08-14' })
    expect(decision.coreWeeks).toBe(PLAN_WEEKS_DEFAULT)
    expect(decision.outcome).toBe('startShiftedLater')
    expect(decision.shiftedWeeks).toBeGreaterThan(0)
  })

  it('shifts a full-length plan later so the taper lands on race week', () => {
    // Race pushed back three weeks; the plan is already full length.
    const decision = reanchorToRaceDate({ ...base, raceDate: '2027-02-15' })
    expect(decision.outcome).toBe('startShiftedLater')
    expect(decision.shiftedWeeks).toBe(3)
    expect(decision.startDate).toBe('2026-09-07')
    expect(decision.coreWeeks).toBe(PLAN_WEEKS_DEFAULT)
  })

  it('always explains itself, in every outcome', () => {
    const races = [ALIGNED_RACE_WEEK_MONDAY, '2027-02-15', '2026-10-05', '2028-08-14']
    for (const raceDate of races) {
      expect(reanchorToRaceDate({ ...base, raceDate }).explanation.length).toBeGreaterThan(0)
    }
  })

  it('is pure: identical input always yields an identical decision', () => {
    const args = { ...base, raceDate: '2026-10-05' }
    expect(reanchorToRaceDate(args)).toEqual(reanchorToRaceDate(args))
  })
})
