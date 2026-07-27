import { describe, expect, it } from 'vitest'
import type { ScheduleOverride } from '@/domain/types'
import { activePin } from '../pins'

describe('activePin', () => {
  it('picks the most recently created pinned override', () => {
    const overrides: ScheduleOverride[] = [
      { id: 'a', instanceId: 't1', date: '2026-08-05', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' },
      { id: 'b', instanceId: 't1', date: '2026-08-06', isPinned: true, createdAt: '2026-08-04T09:00:00.000Z' },
    ]
    expect(activePin(overrides, 't1')?.id).toBe('b')
  })

  it('ignores overrides for other instances and unpinned overrides', () => {
    const overrides: ScheduleOverride[] = [
      { id: 'a', instanceId: 't2', date: '2026-08-05', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' },
      { id: 'b', instanceId: 't1', date: '2026-08-06', isPinned: false, createdAt: '2026-08-04T09:00:00.000Z' },
    ]
    expect(activePin(overrides, 't1')).toBeNull()
  })

  it('breaks a tied createdAt deterministically by id, regardless of array order (Finding 6)', () => {
    const tie = '2026-08-03T09:00:00.000Z'
    const forward: ScheduleOverride[] = [
      { id: 'aaa', instanceId: 't1', date: '2026-08-05', isPinned: true, createdAt: tie },
      { id: 'zzz', instanceId: 't1', date: '2026-08-06', isPinned: true, createdAt: tie },
    ]
    const reversed = [...forward].reverse()
    const forwardWinner = activePin(forward, 't1')
    const reversedWinner = activePin(reversed, 't1')
    expect(forwardWinner?.id).toBe(reversedWinner?.id)
    // Discriminating: before Finding 6's fix, a tied createdAt fell through
    // to `best` (whichever came first in array order), so forward and
    // reversed disagreed on the winner.
    expect(forwardWinner?.id).toBe('zzz')
  })
})
