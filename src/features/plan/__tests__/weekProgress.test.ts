import { describe, expect, it } from 'vitest'
import { weekProgress } from '../planConstants'

describe('weekProgress', () => {
  it('reads a week with nothing materialized as upcoming, not done', () => {
    expect(weekProgress([])).toBe('upcoming')
  })

  it('reads a fully attended week as completed', () => {
    expect(weekProgress(['completed', 'completed', 'partiallyCompleted'])).toBe('completed')
  })

  /** The athlete's own catch: sixteen weeks past race day were auto-dropped and
   * the Plan tab called every one of them "Done". */
  it('never calls a week done when nothing in it was attended', () => {
    expect(weekProgress(['autoDropped', 'autoDropped', 'skipped'])).toBe('dropped')
  })

  it('counts a week as completed once anything in it was attended, even alongside drops', () => {
    expect(weekProgress(['completed', 'autoDropped', 'skipped'])).toBe('completed')
  })

  it('reads a part-trained week as in progress', () => {
    expect(weekProgress(['completed', 'upcoming', 'upcoming'])).toBe('inProgress')
    expect(weekProgress(['inProgress', 'upcoming'])).toBe('inProgress')
    expect(weekProgress(['available', 'upcoming'])).toBe('inProgress')
  })

  /**
   * Seen in the browser on race week, twenty weeks out: three of its four
   * sessions fall after race day and are auto-dropped, and the week read "In
   * progress" purely because of them. A dropped session is not a started week.
   */
  it('does not call a week in progress just because one of its sessions was dropped', () => {
    expect(weekProgress(['autoDropped', 'upcoming', 'upcoming', 'upcoming'])).toBe('upcoming')
    expect(weekProgress(['skipped', 'upcoming'])).toBe('upcoming')
  })

  it('reads an untouched future week as upcoming', () => {
    expect(weekProgress(['upcoming', 'upcoming', 'upcoming'])).toBe('upcoming')
  })
})
