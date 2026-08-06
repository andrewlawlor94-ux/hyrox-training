import type { FC } from 'react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components'
import { formatDuration } from '@/domain/units/format'
import { useSettings } from '@/hooks/useSettings'
import { cancelScheduledTone, playFeedback, scheduleTone } from './feedback'
import { useRestTimer } from './useRestTimer'

/** The fixed +/-30s step every adjust control applies. */
const ADJUST_STEP_SEC = 30
/**
 * How long an expired timer stays on screen before clearing itself. Without
 * this the bar sat at 0:00 across every screen, forever, until the athlete
 * tapped Skip — a permanent band on a phone after every single set. Measured
 * from the moment the expiry was NOTICED, not from `endsAt`: a rest that ran out
 * while the athlete was in another app has to survive long enough to be read
 * once they come back. `STALE_EXPIRY_SEC` is what stops that turning into a
 * resurrected timer from hours ago.
 */
const EXPIRED_LINGER_SEC = 30
/**
 * Past this, an expired timer is history rather than a rest that just ended: it
 * clears immediately, silently, with no beep and no "finished 4 hours ago". A
 * reopened app must not sound an alarm for a session that ended yesterday.
 */
const STALE_EXPIRY_SEC = 600
/** Below this, "finished N ago" is noise — treat it as having just ended. */
const JUST_ENDED_SEC = 3
const MS_PER_SEC = 1000

/**
 * Persistent rest-timer bar (§12). Absent entirely when no timer row exists
 * — not a hidden/zero-height element, an actual `null` render, so it never
 * occupies layout or the accessibility tree when there's nothing to show.
 *
 * Two things fire the expiry beep, and only one of them ever gets to:
 *
 * 1. `scheduleTone` queues it in the audio graph the moment the timer starts, so
 *    it sounds with no JavaScript running at all. This is the fix for the
 *    athlete's "the timer doesn't go off if I'm in another app" — a backgrounded
 *    page's timers are throttled or suspended, so the interval below never ran.
 *    See `scheduleTone` for exactly where this does and does not work; on iOS,
 *    switching apps suspends the audio context and no web API can beat that.
 * 2. Failing that (no audio context, or a context that would not start), the
 *    effect below plays it on noticing the expiry, as before.
 *
 * `firedForEndsAt` records the `endsAt` feedback already ran for, so the 250ms
 * re-render tick driving the countdown can't re-trigger it on every subsequent
 * tick once the remainder reaches zero.
 */
export const RestTimerBar: FC = () => {
  const { state, remainingSec, isRunning, pause, resume, add, skip } = useRestTimer()
  const settings = useSettings()
  const firedForEndsAt = useRef<string | undefined>(undefined)
  const firedAtMs = useRef<number | null>(null)
  /** Whether the beep for the CURRENT `endsAt` is already queued in the audio
   * graph, so the on-screen expiry only vibrates instead of double-beeping. */
  const toneQueued = useRef(false)

  const isExpired = state !== undefined && !state.isPaused && remainingSec === 0
  const secondsSinceExpiry = state?.endsAt === undefined
    ? 0
    : Math.max(0, (Date.now() - new Date(state.endsAt).getTime()) / MS_PER_SEC)

  // Queue the beep ahead of time, once per (endsAt, paused, sound) combination —
  // deliberately NOT keyed on `remainingSec`, which changes four times a second
  // and would re-queue the tone on every tick.
  useEffect(() => {
    const endsAt = state?.endsAt
    // A paused timer has no `endsAt` at all — it stores a remainder instead — so
    // there is no moment to queue a beep against until it resumes.
    if (endsAt === undefined || state === undefined || state.isPaused || settings?.restSoundEnabled !== true) {
      cancelScheduledTone()
      toneQueued.current = false
      return
    }
    toneQueued.current = scheduleTone((new Date(endsAt).getTime() - Date.now()) / MS_PER_SEC)
    return () => { cancelScheduledTone() }
  }, [state?.endsAt, state?.isPaused, settings?.restSoundEnabled, state])

  useEffect(() => {
    if (state === undefined) {
      firedForEndsAt.current = undefined
      firedAtMs.current = null
      return
    }
    if (!isExpired || settings === undefined) return
    if (firedForEndsAt.current === state.endsAt) return
    firedForEndsAt.current = state.endsAt
    firedAtMs.current = Date.now()
    // Long-dead timer: clear it without a sound. Beeping for a rest that ended
    // hours ago is worse than staying quiet.
    if (secondsSinceExpiry >= STALE_EXPIRY_SEC) {
      void skip()
      return
    }
    playFeedback(settings, { skipSound: toneQueued.current })
  }, [state, isExpired, settings, secondsSinceExpiry, skip])

  // Clears itself once the expiry has been on screen for `EXPIRED_LINGER_SEC`.
  // `useRestTimer`'s 250ms tick keeps re-running this effect while the row
  // exists, so no separate timeout is needed.
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
    const noticedMs = firedAtMs.current
    if (noticedMs === null) return
    if ((Date.now() - noticedMs) / MS_PER_SEC >= EXPIRED_LINGER_SEC) void skip()
  }, [state, isExpired, remainingSec, skip, settings])

  if (state === undefined) return null

  const missedIt = isExpired && secondsSinceExpiry >= JUST_ENDED_SEC
  const label = isExpired
    // Says how long ago, rather than pretending it just went off. An athlete who
    // was in another app deserves the truth about what they missed.
    ? missedIt ? `Rest finished ${formatDuration(Math.round(secondsSinceExpiry))} ago` : 'Rest complete'
    : state.label

  return (
    <div className={isExpired ? 'rest-timer-bar rest-timer-bar--expired' : 'rest-timer-bar'} role="group" aria-label="Rest timer">
      <div className="rest-timer-bar__info">
        <p className="rest-timer-bar__label">{label}</p>
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
