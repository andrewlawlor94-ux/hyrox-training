import { describe, expect, it } from 'vitest'
import { addDays, compareDates, daysBetween, startOfIsoWeek } from '../dates'

describe('addDays', () => {
  it('rolls over a non-leap February (2026 is not a leap year)', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('rolls over a leap February (2028 is a leap year)', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('supports negative deltas', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('supports a zero delta', () => {
    expect(addDays('2026-06-15', 0)).toBe('2026-06-15')
  })
})

describe('daysBetween', () => {
  it('counts whole days from an earlier date to a later date', () => {
    expect(daysBetween('2026-08-24', '2026-09-01')).toBe(8)
  })

  it('is negative when the second date is earlier', () => {
    expect(daysBetween('2026-09-01', '2026-08-24')).toBe(-8)
  })

  it('is zero for the same date', () => {
    expect(daysBetween('2026-08-24', '2026-08-24')).toBe(0)
  })
})

describe('startOfIsoWeek', () => {
  it('returns the Monday of the week for a midweek date', () => {
    expect(startOfIsoWeek('2026-08-26')).toBe('2026-08-24')
  })

  it('returns the same date when it is already Monday', () => {
    expect(startOfIsoWeek('2026-08-24')).toBe('2026-08-24')
  })

  it('assigns Sunday to the prior ISO week, not the upcoming one', () => {
    expect(startOfIsoWeek('2026-08-23')).toBe('2026-08-17')
  })
})

describe('compareDates', () => {
  it('is negative when the first date is earlier', () => {
    expect(compareDates('2026-08-24', '2026-08-25')).toBeLessThan(0)
  })

  it('is positive when the first date is later', () => {
    expect(compareDates('2026-08-25', '2026-08-24')).toBeGreaterThan(0)
  })

  it('is zero for equal dates', () => {
    expect(compareDates('2026-08-24', '2026-08-24')).toBe(0)
  })
})
