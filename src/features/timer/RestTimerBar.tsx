import type { FC } from 'react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components'
import { formatDuration } from '@/domain/units/format'
import { useSettings } from '@/hooks/useSettings'
import { playFeedback } from './feedback'
import { useRestTimer } from './useRestTimer'

/** The fixed +/-30s step every adjust control applies. */
const ADJUST_STEP_SEC = 30
/**
 * How long an expired timer stays on screen before clearing itself. Without
 * this the bar sat at 0:00 across every screen, forever, until the athlete
 * tapped Skip — a permanent band on a phone after every single set, and on a
 * reopened app a stale 0:00 from a session that ended hours ago. Long enough to
 * notice and hit "+30s" for a bit more rest; short enough not to litter.
 */
const EXPIRED_LINGER_SEC = 30
const MS_PER_SEC = 1000

/**
 * Persistent rest-timer bar (§12). Absent entirely when no timer row exists
 * — not a hidden/zero-height element, an actual `null` render, so it never
 * occupies layout or the accessibility tree when there's nothing to show.
 *
 * Fires `playFeedback` exactly once per expiry: `firedForEndsAt` records the
 * `endsAt` value feedback already ran for, so the 250ms re-render tick
 * driving the countdown can't re-trigger it on every subsequent tick once
 * the remainder reaches zero. It resets whenever the timer row itself goes
 * away (skipped, or a fresh timer with a new `endsAt` starts).
 */
export const RestTimerBar: FC = () => {
  const { state, remainingSec, isRunning, pause, resume, add, skip } = useRestTimer()
  const settings = useSettings()
  const firedForEndsAt = useRef<string | undefined>(undefined)

  const isExpired = state !== undefined && !state.isPaused && remainingSec === 0

  useEffect(() => {
    if (state === undefined) {
      firedForEndsAt.current = undefined
      return
    }
    if (!isExpired || settings === undefined) return
    if (firedForEndsAt.current === state.endsAt) return
    firedForEndsAt.current = state.endsAt
    playFeedback(settings)
  }, [state, isExpired, settings])

  // Clears itself once the rest has been over for `EXPIRED_LINGER_SEC`.
  // Measured from the stored `endsAt`, not from a timer this component starts,
  // so it holds across navigation, a screen lock, and a reopened app — a timer
  // that expired an hour ago is gone on the first render rather than lingering
  // for another 30s. `useRestTimer`'s 250ms tick keeps re-running this effect
  // while the row exists, so no separate timeout is needed.
  useEffect(() => {
    if (state?.endsAt === undefined || !isExpired) return
    // Never clear before the expiry feedback has actually fired for THIS
    // `endsAt`. Adjusting a running timer with -30s can land it more than
    // `EXPIRED_LINGER_SEC` in the past in one step, and clearing on that same
    // render would remove the row before the effect above ever ran — the
    // athlete would get no beep at all, which is precisely the "sound stops
    // working when I use -30s" report. Settings still loading counts as
    // not-yet-fired, for the same reason.
    if (settings === undefined || firedForEndsAt.current !== state.endsAt) return
    const secondsSinceExpiry = (Date.now() - new Date(state.endsAt).getTime()) / MS_PER_SEC
    if (secondsSinceExpiry >= EXPIRED_LINGER_SEC) void skip()
  }, [state, isExpired, remainingSec, skip, settings])

  if (state === undefined) return null

  return (
    <div className={isExpired ? 'rest-timer-bar rest-timer-bar--expired' : 'rest-timer-bar'} role="group" aria-label="Rest timer">
      <div className="rest-timer-bar__info">
        <p className="rest-timer-bar__label">{isExpired ? 'Rest complete' : state.label}</p>
        <p className="rest-timer-bar__countdown" aria-live="polite">{formatDuration(remainingSec)}</p>
      </div>
      <div className="rest-timer-bar__controls">
        {/* Pause and -30s are meaningless once the rest is over — there is
            nothing left to pause or shorten. "+30s" survives because "I need a
            bit more" is a real thing to want at 0:00. */}
        {!isExpired && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { void (isRunning ? pause() : resume()) }}
            >
              {isRunning ? 'Pause' : 'Resume'}
            </Button>
            <Button variant="quiet" size="sm" onClick={() => { void add(-ADJUST_STEP_SEC) }}>-30s</Button>
          </>
        )}
        <Button variant="quiet" size="sm" onClick={() => { void add(ADJUST_STEP_SEC) }}>+30s</Button>
        <Button variant="quiet" size="sm" onClick={() => { void skip() }}>{isExpired ? 'Done' : 'Skip'}</Button>
      </div>
    </div>
  )
}
