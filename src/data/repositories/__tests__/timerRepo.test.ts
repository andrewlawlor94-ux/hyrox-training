import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase, openDb, db } from '@/data/db'
import { adjustTimer, clearTimer, getTimerState, pauseTimer, remainingSeconds, resumeTimer, startTimer } from '../timerRepo'

const T0 = '2026-07-27T10:00:00.000Z'
const T0_PLUS_30S = '2026-07-27T10:00:30.000Z'

beforeEach(async () => { await resetDatabase() })

describe('timerRepo', () => {
  it('startTimer stores endsAt = now + totalSec and isPaused: false', async () => {
    await startTimer({ label: 'Rest', totalSec: 90, now: T0 })
    const state = await getTimerState()
    expect(state?.endsAt).toBe('2026-07-27T10:01:30.000Z')
    expect(state?.isPaused).toBe(false)
    expect(state?.totalSec).toBe(90)
  })

  it('computes remaining time from a stored endsAt after a simulated 30-second gap', async () => {
    await startTimer({ label: 'Rest', totalSec: 90, now: T0 })
    const state = await getTimerState()
    if (!state) throw new Error('expected state')
    expect(remainingSeconds(state, T0_PLUS_30S)).toBe(60)
  })

  it('pauseTimer stores pausedRemainingSec and clears endsAt', async () => {
    await startTimer({ label: 'Rest', totalSec: 90, now: T0 })
    await pauseTimer(T0_PLUS_30S)
    const state = await getTimerState()
    expect(state?.isPaused).toBe(true)
    expect(state?.pausedRemainingSec).toBe(60)
    expect(state?.endsAt).toBeUndefined()
  })

  it('resumeTimer recomputes endsAt from the paused remainder and the new now', async () => {
    await startTimer({ label: 'Rest', totalSec: 90, now: T0 })
    await pauseTimer(T0_PLUS_30S)
    const resumeAt = '2026-07-27T10:05:00.000Z'
    await resumeTimer(resumeAt)
    const state = await getTimerState()
    expect(state?.isPaused).toBe(false)
    expect(state?.endsAt).toBe('2026-07-27T10:06:00.000Z') // resumeAt + 60s remaining
  })

  it('adjustTimer(+30) shifts endsAt forward by 30s', async () => {
    await startTimer({ label: 'Rest', totalSec: 90, now: T0 })
    await adjustTimer(30, T0)
    const state = await getTimerState()
    expect(state?.endsAt).toBe('2026-07-27T10:02:00.000Z')
  })

  it('adjustTimer(-30) never produces a negative remainder', async () => {
    await startTimer({ label: 'Rest', totalSec: 10, now: T0 })
    await adjustTimer(-30, T0)
    const state = await getTimerState()
    if (!state) throw new Error('expected state')
    // Checking `remainingSeconds` alone would not discriminate: that helper
    // clamps independently of what adjustTimer stored. Assert the persisted
    // `endsAt` itself is not earlier than `now` -- an unclamped
    // implementation stores `endsAt = now - 20s`, which this pins directly.
    expect(state.endsAt).toBe(T0)
    expect(remainingSeconds(state, T0)).toBe(0)
  })

  it('survives closing and reopening the database', async () => {
    await startTimer({ label: 'Rest', totalSec: 90, now: T0 })
    db.close()
    await openDb()
    const state = await getTimerState()
    expect(state?.totalSec).toBe(90)
    expect(state?.label).toBe('Rest')
  })

  it('clearTimer removes the row', async () => {
    await startTimer({ label: 'Rest', totalSec: 90, now: T0 })
    await clearTimer()
    expect(await getTimerState()).toBeUndefined()
  })
})
