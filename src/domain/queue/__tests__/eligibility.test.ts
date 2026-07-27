import { describe, expect, it } from 'vitest'
import { isDayEligible, simulationClearanceConflict } from '../eligibility'

const RACE = '2027-01-16'

describe('never two workouts in one day', () => {
  it('rejects a day that already has a workout', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['easyRun'],
      occupied: [{ date: '2026-08-25', tags: ['lowerBodyStrength'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('dayOccupied')
  })
})

describe('one rest day per rolling seven days', () => {
  it('rejects a placement that would fill all seven days of a window', () => {
    const occupied = ['2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24']
      .map((date) => ({ date, tags: ['lowImpactAerobic' as const] }))
    const r = isDayEligible({ candidate: '2026-08-25', candidateTags: ['lowImpactAerobic'], occupied, raceDate: RACE })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('restDayRule')
  })

  it('allows a sixth workout in a seven-day window', () => {
    const occupied = ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24']
      .map((date) => ({ date, tags: ['lowImpactAerobic' as const] }))
    expect(isDayEligible({ candidate: '2026-08-25', candidateTags: ['lowImpactAerobic'], occupied, raceDate: RACE }).eligible).toBe(true)
  })

  it('checks every rolling window containing the candidate, not just the trailing one', () => {
    // Candidate 2026-08-25; the window 2026-08-25..2026-08-31 is already full.
    const occupied = ['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31']
      .map((date) => ({ date, tags: ['lowImpactAerobic' as const] }))
    const r = isDayEligible({ candidate: '2026-08-25', candidateTags: ['lowImpactAerobic'], occupied, raceDate: RACE })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('restDayRule')
  })
})

describe('recovery conflicts', () => {
  it('rejects a hard run the day after a hard run', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['hardRun'],
      occupied: [{ date: '2026-08-24', tags: ['hardRun'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('recoveryConflict')
    expect(r.conflicts[0]?.severity).toBe('hard')
  })

  it('also checks the day after the candidate', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['hardRun'],
      occupied: [{ date: '2026-08-26', tags: ['hardRun'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(false)
  })

  it('reports a soft conflict but stays eligible', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['hardRun'],
      occupied: [{ date: '2026-08-24', tags: ['highImpactStation'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(true)
    expect(r.conflicts[0]?.severity).toBe('soft')
  })

  it('omits soft conflicts entirely when asked to ignore them', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['hardRun'],
      occupied: [{ date: '2026-08-24', tags: ['highImpactStation'] }], raceDate: RACE,
      ignoreSoftConflicts: true,
    })
    expect(r.conflicts).toEqual([])
  })

  it('ignores days more than one apart for the pairwise matrix', () => {
    const r = isDayEligible({
      candidate: '2026-08-25', candidateTags: ['hardRun'],
      occupied: [{ date: '2026-08-23', tags: ['hardRun'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(true)
  })
})

describe('race simulation clearance', () => {
  it('requires two clear days after a simulation before hard work', () => {
    const occupied = [{ date: '2026-08-24', tags: ['raceSimulation' as const] }]
    expect(simulationClearanceConflict(occupied, '2026-08-26', ['hardRun'])?.severity).toBe('hard')
  })

  it('permits hard work on the third day after a simulation', () => {
    const occupied = [{ date: '2026-08-24', tags: ['raceSimulation' as const] }]
    expect(simulationClearanceConflict(occupied, '2026-08-27', ['hardRun'])).toBeNull()
  })

  it('permits easy work the day after a simulation', () => {
    const occupied = [{ date: '2026-08-24', tags: ['raceSimulation' as const] }]
    expect(simulationClearanceConflict(occupied, '2026-08-25', ['easyRun'])).toBeNull()
  })

  it('is surfaced through isDayEligible', () => {
    const r = isDayEligible({
      candidate: '2026-08-26', candidateTags: ['lowerBodyStrength'],
      occupied: [{ date: '2026-08-24', tags: ['raceSimulation'] }], raceDate: RACE,
    })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('recoveryConflict')
  })
})

describe('race date anchoring', () => {
  it('rejects a day after the race date', () => {
    const r = isDayEligible({ candidate: '2027-01-17', candidateTags: ['easyRun'], occupied: [], raceDate: RACE })
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toBe('pastRaceDate')
  })

  it('accepts the race date itself', () => {
    expect(isDayEligible({ candidate: RACE, candidateTags: ['raceSimulation'], occupied: [], raceDate: RACE }).eligible).toBe(true)
  })
})

describe('precedence of blocking reasons', () => {
  it('reports pastRaceDate before anything else', () => {
    const r = isDayEligible({
      candidate: '2027-01-17', candidateTags: ['hardRun'],
      occupied: [{ date: '2027-01-17', tags: ['hardRun'] }], raceDate: RACE,
    })
    expect(r.blockedBy).toBe('pastRaceDate')
  })

  it('reports dayOccupied before the rest day rule', () => {
    const occupied = ['2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25']
      .map((date) => ({ date, tags: ['lowImpactAerobic' as const] }))
    expect(isDayEligible({ candidate: '2026-08-25', candidateTags: ['easyRun'], occupied, raceDate: RACE }).blockedBy).toBe('dayOccupied')
  })
})
