import { describe, expect, it } from 'vitest'
import { HistoryImmutableError } from '../errors'
import { assertMutable } from '../repositories/guard'

describe('assertMutable', () => {
  it('permits writes to an unfrozen instance', () => {
    expect(() => { assertMutable({ id: 'wi_1', frozen: false }) }).not.toThrow()
  })

  it('rejects writes to a frozen instance', () => {
    expect(() => { assertMutable({ id: 'wi_1', frozen: true }) }).toThrow(HistoryImmutableError)
  })

  it('names the offending record so the error is actionable', () => {
    try {
      assertMutable({ id: 'wi_42', frozen: true })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(HistoryImmutableError)
      expect((err as HistoryImmutableError).id).toBe('wi_42')
    }
  })

  it('permits writes to a frozen instance only via an explicit history edit', () => {
    expect(() => { assertMutable({ id: 'wi_1', frozen: true }, { allowHistoryEdit: true }) }).not.toThrow()
  })
})
