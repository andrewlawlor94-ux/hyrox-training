import { describe, expect, it, vi } from 'vitest'
import type { RestTimerState } from '@/data/types'
import { remainingFrom } from '../useRestTimer'

const T0 = '2026-07-27T10:00:00.000Z'
const T0_PLUS_30S = '2026-07-27T10:00:30.000Z'
const T0_PLUS_90S = '2026-07-27T10:01:30.000Z'
const T0_PLUS_120S = '2026-07-27T10:02:00.000Z'

function runningState(endsAt: string): RestTimerState {
  return { id: 'active', label: 'Rest', endsAt, isPaused: false, totalSec: 90, startedAt: T0 }
}

function pausedState(pausedRemainingSec?: number): RestTimerState {
  return {
    id: 'active', label: 'Rest', isPaused: true, totalSec: 90, startedAt: T0,
    ...(pausedRemainingSec !== undefined ? { pausedRemainingSec } : {}),
  }
}

describe('remainingFrom', () => {
  it('returns 90 for a running timer with endsAt 90s ahead of now', () => {
    expect(remainingFrom(runningState(T0_PLUS_90S), T0)).toBe(90)
  })

  it('returns 60 for the same state evaluated 30s later — accuracy comes from the stored timestamp, not tick accumulation', () => {
    const state = runningState(T0_PLUS_90S)
    expect(remainingFrom(state, T0_PLUS_30S)).toBe(60)
  })

  it('returns 0, never negative, once endsAt has passed', () => {
    expect(remainingFrom(runningState(T0_PLUS_90S), T0_PLUS_120S)).toBe(0)
  })

  it('returns pausedRemainingSec for a paused state regardless of elapsed wall time — the screen-lock case', () => {
    const state = pausedState(60)
    expect(remainingFrom(state, T0)).toBe(60)
    expect(remainingFrom(state, T0_PLUS_120S)).toBe(60)
  })

  it('returns 0 for a paused state with no stored remainder', () => {
    expect(remainingFrom(pausedState(), T0)).toBe(0)
  })

  it('is pure: never reads the ambient clock itself', () => {
    const dateNowSpy = vi.spyOn(Date, 'now')
    remainingFrom(runningState(T0_PLUS_90S), T0)
    expect(dateNowSpy).not.toHaveBeenCalled()
    dateNowSpy.mockRestore()
  })
})
