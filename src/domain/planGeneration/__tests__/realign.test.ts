import { describe, expect, it } from 'vitest'
import { addDays, startOfIsoWeek } from '@/domain/dates'
import type { HistoricalSession } from '../realign'
import { realignPlanToToday, resumeWeekFromHistory } from '../realign'
import { PLAN_WEEKS_DEFAULT } from '../constants'

/** A Wednesday, so every Monday-boundary calculation is actually exercised. */
const TODAY = '2026-08-05'
const THIS_MONDAY = '2026-08-03'
/** A Saturday ten weeks out; its ISO week starts 2026-10-05. */
const RACE = '2026-10-10'
const RACE_MONDAY = '2026-10-05'
const WEEKS_TO_RACE = 10

const base = {
  today: TODAY,
  raceDate: RACE,
  currentStartDate: '2026-01-05',
  baseWeeks: 0,
  currentCoreWeeks: PLAN_WEEKS_DEFAULT,
  lastHistoryWeek: 4,
}

function attended(weekNumber: number): HistoricalSession {
  return { weekNumber, outcome: 'attended' }
}

describe('resumeWeekFromHistory', () => {
  it('resumes at week 1 when nothing has been attended', () => {
    expect(resumeWeekFromHistory([])).toBe(1)
    expect(resumeWeekFromHistory([{ weekNumber: 3, outcome: 'outstanding' }])).toBe(1)
    // Every session skipped is still no progress made.
    expect(resumeWeekFromHistory([{ weekNumber: 2, outcome: 'settled' }])).toBe(1)
  })

  it('stays in the last attended week while that week still has work outstanding', () => {
    const sessions = [attended(4), attended(5), { weekNumber: 5, outcome: 'outstanding' as const }]
    expect(resumeWeekFromHistory(sessions)).toBe(5)
  })

  it('moves to the next week once the last attended week has nothing outstanding', () => {
    expect(resumeWeekFromHistory([attended(4), attended(5)])).toBe(6)
  })

  /**
   * A skip, and an auto-drop, are both decisions already made — the repository
   * maps them both to `settled`. Holding the week open for them would rewind the
   * athlete into a week the plan has already moved past, and (for auto-drops)
   * would make the answer depend on placement results a realign then changes,
   * so realigning twice could give two different weeks.
   */
  it('does not hold a week open for a session already settled', () => {
    const sessions = [attended(5), { weekNumber: 5, outcome: 'settled' as const }]
    expect(resumeWeekFromHistory(sessions)).toBe(6)
  })

  /**
   * The drift this whole feature exists for: the calendar ran on for four more
   * weeks and dropped every session in them. Those weeks are not progress, so
   * the plan must resume at week 5 — not at week 9, which would silently skip
   * four weeks of training the athlete never did.
   */
  it('ignores later weeks that were entirely missed, however many there are', () => {
    const sessions: HistoricalSession[] = [attended(3), attended(4)]
    // Weeks 5 and 6 were dropped by the plan; 7 and 8 are still merely upcoming.
    for (const week of [5, 6]) sessions.push({ weekNumber: week, outcome: 'settled' })
    for (const week of [7, 8]) sessions.push({ weekNumber: week, outcome: 'outstanding' })
    expect(resumeWeekFromHistory(sessions)).toBe(5)
  })

  it('counts a PARTIAL completion as attended, since the caller maps it that way', () => {
    // Mapping lives in the repository; this only asserts the contract's shape —
    // one attended session in week 7 is enough to have reached week 7.
    expect(resumeWeekFromHistory([attended(7)])).toBe(8)
  })

  it('is pure: the same history always gives the same week', () => {
    const sessions = [attended(4), { weekNumber: 4, outcome: 'outstanding' as const }]
    expect(resumeWeekFromHistory(sessions)).toBe(resumeWeekFromHistory(sessions))
  })
})

describe('realignPlanToToday', () => {
  it('starts the resume week THIS week', () => {
    const decision = realignPlanToToday({ ...base, resumeWeek: 5 })
    // Week 5's Monday is this Monday.
    expect(addDays(decision.startDate, 4 * 7)).toBe(THIS_MONDAY)
    expect(decision.resumeWeek).toBe(5)
    expect(decision.outcome).toBe('realigned')
  })

  it('still ends on race week, whatever the drift was', () => {
    for (const resumeWeek of [1, 2, 5, 9, 14, 20]) {
      const decision = realignPlanToToday({ ...base, resumeWeek, lastHistoryWeek: resumeWeek - 1 })
      const finalWeekMonday = addDays(decision.startDate, (decision.totalWeeks - 1) * 7)
      expect(finalWeekMonday, `resumeWeek ${String(resumeWeek)}`).toBe(RACE_MONDAY)
    }
  })

  it('shortens the plan when the athlete is behind, so the taper is not pushed past race day', () => {
    const decision = realignPlanToToday({ ...base, resumeWeek: 5 })
    // 4 weeks behind the resume point + 10 weeks to race week.
    expect(decision.totalWeeks).toBe(4 + WEEKS_TO_RACE)
    expect(decision.coreWeeks).toBe(14)
    expect(decision.requiresRegeneration).toBe(true)
  })

  /**
   * The deliberate difference from `reanchorToRaceDate`, which only ever moves a
   * start LATER. An athlete who is AHEAD of the calendar needs the start pulled
   * earlier, and the weeks that fall into the past as a result are precisely the
   * weeks they already finished.
   */
  it('moves the start EARLIER for an athlete who is ahead', () => {
    const behind = realignPlanToToday({ ...base, resumeWeek: 3, lastHistoryWeek: 2 })
    const ahead = realignPlanToToday({ ...base, resumeWeek: 12, lastHistoryWeek: 11 })
    expect(ahead.startDate < behind.startDate).toBe(true)
    expect(ahead.resumeWeek).toBe(12)
  })

  it('reports no date change when the resume week already starts this week at the right length', () => {
    const aligned = realignPlanToToday({ ...base, resumeWeek: 5 })
    const again = realignPlanToToday({
      ...base, resumeWeek: 5,
      currentStartDate: aligned.startDate,
      currentCoreWeeks: aligned.coreWeeks,
    })
    expect(again.outcome).toBe('alreadyAligned')
    expect(again.startDate).toBe(aligned.startDate)
    expect(again.requiresRegeneration).toBe(false)
    // Still worth running: the pins are what was stale.
    expect(again.explanation).toMatch(/pinned moves/i)
  })

  it('is anchored to race WEEK, so any day of that week aligns identically', () => {
    const monday = realignPlanToToday({ ...base, raceDate: RACE_MONDAY, resumeWeek: 5 })
    const saturday = realignPlanToToday({ ...base, raceDate: RACE, resumeWeek: 5 })
    expect(monday.startDate).toBe(saturday.startDate)
    expect(monday.totalWeeks).toBe(saturday.totalWeeks)
  })

  /**
   * Caught in the browser: a plan with a three-week prologue and 24 core weeks
   * proposed dropping a CORE week while keeping all three prologue weeks. The
   * prologue is filler `anchorPlan` invents so the athlete trains today rather
   * than waiting; a core week is a week of the actual programme.
   */
  it('gives up prologue weeks before it gives up a single core week', () => {
    // 26 weeks of room, a 3-week prologue: the core block stays whole at 24 and
    // the prologue absorbs the loss.
    const decision = realignPlanToToday({
      ...base, baseWeeks: 3, raceDate: '2027-01-30', resumeWeek: 1, lastHistoryWeek: 0,
    })
    expect(decision.totalWeeks).toBe(26)
    expect(decision.coreWeeks).toBe(PLAN_WEEKS_DEFAULT)
    expect(decision.baseWeeks).toBe(2)
    expect(decision.explanation).toMatch(/prologue goes from 3 weeks to 2/)
  })

  it('drops the prologue entirely before touching the core block', () => {
    const decision = realignPlanToToday({ ...base, baseWeeks: 4, resumeWeek: 5 })
    expect(decision.totalWeeks).toBe(14)
    expect(decision.baseWeeks).toBe(0)
    expect(decision.coreWeeks).toBe(14)
  })

  it('base + core always add up to the plan it says it will run', () => {
    for (const baseWeeks of [0, 3, 8]) {
      for (const resumeWeek of [1, 5, 12, 20]) {
        const decision = realignPlanToToday({ ...base, baseWeeks, resumeWeek, lastHistoryWeek: resumeWeek - 1 })
        expect(decision.baseWeeks + decision.coreWeeks, `${String(baseWeeks)}/${String(resumeWeek)}`).toBe(decision.totalWeeks)
        expect(decision.baseWeeks).toBeGreaterThanOrEqual(0)
        expect(decision.coreWeeks).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('never asks for more weeks than the seed contains, and says so when it clamps', () => {
    const decision = realignPlanToToday({ ...base, resumeWeek: 20, lastHistoryWeek: 19 })
    // 19 + 10 = 29 weeks wanted; only 24 exist.
    expect(decision.totalWeeks).toBe(PLAN_WEEKS_DEFAULT)
    expect(decision.coreWeeks).toBe(PLAN_WEEKS_DEFAULT)
    expect(decision.requestedResumeWeek).toBe(20)
    expect(decision.resumeWeek).toBe(PLAN_WEEKS_DEFAULT - WEEKS_TO_RACE + 1)
    expect(decision.explanation).toMatch(/History reaches week 20/)
  })

  it('never ends the plan before a week that already holds real training', () => {
    // Nothing attended (so history asks for week 1) but week 6 carries logged,
    // in-progress work: a 3-week plan would leave that week outside the plan.
    const decision = realignPlanToToday({
      ...base, raceDate: '2026-08-22', resumeWeek: 1, lastHistoryWeek: 6,
    })
    expect(decision.totalWeeks).toBeGreaterThanOrEqual(6)
  })

  it('never produces fewer than one core week, however close the race is', () => {
    const decision = realignPlanToToday({ ...base, raceDate: TODAY, resumeWeek: 1, lastHistoryWeek: 0 })
    expect(decision.coreWeeks).toBe(1)
    expect(decision.startDate).toBe(THIS_MONDAY)
  })

  it('changes nothing at all when race day has already passed', () => {
    const decision = realignPlanToToday({ ...base, raceDate: '2026-07-25', resumeWeek: 5 })
    expect(decision.outcome).toBe('raceInPast')
    expect(decision.startDate).toBe(base.currentStartDate)
    expect(decision.coreWeeks).toBe(base.currentCoreWeeks)
    expect(decision.requiresRegeneration).toBe(false)
    expect(decision.explanation).toMatch(/2026-07-25/)
  })

  it('only flags regeneration when the plan LENGTH changes, not when dates merely shift', () => {
    // Same 14 core weeks it would land on, started a week too late.
    const target = realignPlanToToday({ ...base, resumeWeek: 5 })
    const shiftOnly = realignPlanToToday({
      ...base, resumeWeek: 5,
      currentStartDate: addDays(target.startDate, 7),
      currentCoreWeeks: target.coreWeeks,
    })
    expect(shiftOnly.outcome).toBe('realigned')
    expect(shiftOnly.coreWeeks).toBe(target.coreWeeks)
    expect(shiftOnly.requiresRegeneration).toBe(false)
  })

  it('compares starts by WEEK, so a mid-week stored start still counts as aligned', () => {
    const aligned = realignPlanToToday({ ...base, resumeWeek: 5 })
    const midWeek = realignPlanToToday({
      ...base, resumeWeek: 5,
      currentStartDate: addDays(aligned.startDate, 3),
      currentCoreWeeks: aligned.coreWeeks,
    })
    expect(startOfIsoWeek(addDays(aligned.startDate, 3))).toBe(aligned.startDate)
    expect(midWeek.outcome).toBe('alreadyAligned')
  })

  it('always explains itself, in every outcome', () => {
    const cases = [
      { ...base, resumeWeek: 5 },
      { ...base, resumeWeek: 20, lastHistoryWeek: 19 },
      { ...base, raceDate: '2026-07-25', resumeWeek: 5 },
    ]
    for (const args of cases) {
      expect(realignPlanToToday(args).explanation.length).toBeGreaterThan(0)
    }
  })

  it('is pure: identical input always yields an identical decision', () => {
    const args = { ...base, resumeWeek: 5 }
    expect(realignPlanToToday(args)).toEqual(realignPlanToToday(args))
  })
})
