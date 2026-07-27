import { describe, expect, it } from 'vitest'
import { conflictBetween } from '../recoveryMatrix'

describe('conflictBetween', () => {
  it('blocks hard running on consecutive days', () => {
    expect(conflictBetween(['hardRun'], ['hardRun'])).toBe('hard')
  })

  it('blocks a hard run the day after a long run', () => {
    expect(conflictBetween(['longRun'], ['hardRun'])).toBe('hard')
  })

  it('blocks a long run the day after a hard run', () => {
    expect(conflictBetween(['hardRun'], ['longRun'])).toBe('hard')
  })

  it('blocks heavy lower-body strength immediately before running intervals', () => {
    expect(conflictBetween(['lowerBodyStrength'], ['hardRun'])).toBe('hard')
  })

  it('warns but allows high-impact station work before a hard run', () => {
    expect(conflictBetween(['highImpactStation'], ['hardRun'])).toBe('soft')
  })

  it('warns on back-to-back lower-body strength', () => {
    expect(conflictBetween(['lowerBodyStrength'], ['lowerBodyStrength'])).toBe('soft')
  })

  it('allows an easy run after anything', () => {
    expect(conflictBetween(['hardRun'], ['easyRun'])).toBeNull()
    expect(conflictBetween(['lowerBodyStrength'], ['easyRun'])).toBeNull()
  })

  it('allows anything after low-impact aerobic work', () => {
    expect(conflictBetween(['lowImpactAerobic'], ['hardRun'])).toBeNull()
    expect(conflictBetween(['recovery'], ['lowerBodyStrength'])).toBeNull()
  })

  it('allows upper-body strength before a hard run', () => {
    expect(conflictBetween(['upperBodyStrength'], ['hardRun'])).toBeNull()
  })

  it('returns the most severe conflict across multi-tag sessions', () => {
    expect(conflictBetween(['upperBodyStrength', 'lowerBodyStrength'], ['hardRun'])).toBe('hard')
  })

  it('returns null for empty tag sets', () => {
    expect(conflictBetween([], ['hardRun'])).toBeNull()
    expect(conflictBetween(['hardRun'], [])).toBeNull()
  })
})
