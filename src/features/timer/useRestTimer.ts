import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  adjustTimer, clearTimer, getTimerState, pauseTimer, remainingSeconds, resumeTimer, startTimer,
} from '@/data/repositories'
import type { ISOInstant, RestTimerState } from '@/data/types'

/** How often the hook forces a re-render while a timer is running, purely so
 * the displayed value tracks wall-clock time. The persisted value it reads
 * on every tick is still `endsAt`, never a counter this interval owns — see
 * `remainingFrom`. */
const TICK_INTERVAL_MS = 250

function now(): ISOInstant {
  return new Date().toISOString()
}

/**
 * Pure: remaining seconds derived from a stored `endsAt` (or the paused
 * remainder) and a caller-supplied `now` — never reads the ambient clock
 * itself, which is exactly what makes it accurate after navigation, a screen
 * lock, or a refresh (the same timestamp arithmetic survives all three).
 * Delegates to `timerRepo`'s `remainingSeconds` rather than duplicating the
 * clamp-at-zero/paused-branch logic a second time.
 */
export function remainingFrom(state: RestTimerState, at: ISOInstant): number {
  return remainingSeconds(state, at)
}

export interface RestTimerControls {
  state: RestTimerState | undefined
  remainingSec: number
  isRunning: boolean
  start: (args: { exerciseId?: string; label: string; totalSec: number }) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  add: (deltaSec: number) => Promise<void>
  skip: () => Promise<void>
}

/**
 * Reactive rest-timer controller. `state` is a live query over the singleton
 * timer row (a pure read — `getTimerState` never writes, so it's safe inside
 * `useLiveQuery`'s read-only transaction). While a timer is running, a plain
 * `setInterval` forces a re-render every `TICK_INTERVAL_MS` so `remainingSec`
 * keeps advancing on screen; it never runs while paused or absent, since the
 * remainder can't change either way.
 */
export function useRestTimer(): RestTimerControls {
  const state = useLiveQuery(() => getTimerState())
  const [, forceTick] = useState(0)

  useEffect(() => {
    if (state === undefined || state.isPaused) return
    const interval = setInterval(() => forceTick((t) => t + 1), TICK_INTERVAL_MS)
    return () => { clearInterval(interval) }
  }, [state])

  const remainingSec = state === undefined ? 0 : remainingFrom(state, now())
  const isRunning = state !== undefined && !state.isPaused

  return {
    state,
    remainingSec,
    isRunning,
    start: (args) => startTimer({ ...args, now: now() }),
    pause: () => pauseTimer(now()),
    resume: () => resumeTimer(now()),
    add: (deltaSec) => adjustTimer(deltaSec, now()),
    skip: () => clearTimer(),
  }
}
