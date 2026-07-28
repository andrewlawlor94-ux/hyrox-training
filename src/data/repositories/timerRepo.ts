import { db } from '@/data/db'
import type { ISOInstant, RestTimerState } from '@/data/types'

const TIMER_ID = 'active'
const MS_PER_SECOND = 1000

function toMs(instant: ISOInstant): number {
  return new Date(instant).getTime()
}

function toInstant(ms: number): ISOInstant {
  return new Date(ms).toISOString()
}

/** Pure: computes remaining seconds from a stored `endsAt` (or the paused
 * remainder) and a caller-supplied `now` — no ambient clock read, so a
 * simulated time gap in a test is just a different `now` argument. */
export function remainingSeconds(state: RestTimerState, now: ISOInstant): number {
  if (state.isPaused) return Math.max(0, state.pausedRemainingSec ?? 0)
  if (state.endsAt === undefined) return 0
  return Math.max(0, Math.round((toMs(state.endsAt) - toMs(now)) / MS_PER_SECOND))
}

export async function getTimerState(): Promise<RestTimerState | undefined> {
  return db.restTimerState.get(TIMER_ID)
}

/** Storing an absolute `endsAt` rather than a countdown is what makes the
 * timer survive navigation, screen lock, and refresh (§12) — this row is
 * the persistence itself, not a cache of it. */
export async function startTimer(args: { exerciseId?: string; label: string; totalSec: number; now: ISOInstant }): Promise<void> {
  const endsAt = toInstant(toMs(args.now) + args.totalSec * MS_PER_SECOND)
  const row: RestTimerState = {
    id: TIMER_ID,
    label: args.label,
    endsAt,
    isPaused: false,
    totalSec: args.totalSec,
    startedAt: args.now,
    ...(args.exerciseId !== undefined ? { exerciseId: args.exerciseId } : {}),
  }
  await db.restTimerState.put(row)
}

export async function pauseTimer(now: ISOInstant): Promise<void> {
  const state = await db.restTimerState.get(TIMER_ID)
  if (!state || state.isPaused) return
  const remaining = remainingSeconds(state, now)
  await db.restTimerState.put({
    id: state.id, label: state.label, isPaused: true, pausedRemainingSec: remaining,
    totalSec: state.totalSec, startedAt: state.startedAt,
    ...(state.exerciseId !== undefined ? { exerciseId: state.exerciseId } : {}),
  })
}

export async function resumeTimer(now: ISOInstant): Promise<void> {
  const state = await db.restTimerState.get(TIMER_ID)
  if (!state) return
  const remaining = Math.max(0, state.pausedRemainingSec ?? 0)
  const endsAt = toInstant(toMs(now) + remaining * MS_PER_SECOND)
  await db.restTimerState.put({
    id: state.id, label: state.label, isPaused: false, endsAt,
    totalSec: state.totalSec, startedAt: state.startedAt,
    ...(state.exerciseId !== undefined ? { exerciseId: state.exerciseId } : {}),
  })
}

/** `-30` never produces a negative remainder — `remainingSeconds` and the
 * paused branch both clamp at zero. */
export async function adjustTimer(deltaSec: number, now: ISOInstant): Promise<void> {
  const state = await db.restTimerState.get(TIMER_ID)
  if (!state) return

  if (state.isPaused) {
    const next = Math.max(0, (state.pausedRemainingSec ?? 0) + deltaSec)
    await db.restTimerState.put({ ...state, pausedRemainingSec: next })
    return
  }

  const next = Math.max(0, remainingSeconds(state, now) + deltaSec)
  const endsAt = toInstant(toMs(now) + next * MS_PER_SECOND)
  await db.restTimerState.put({ ...state, endsAt })
}

export async function clearTimer(): Promise<void> {
  await db.restTimerState.delete(TIMER_ID)
}
