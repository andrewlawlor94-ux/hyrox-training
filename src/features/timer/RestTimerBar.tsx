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

  useEffect(() => {
    if (state === undefined) {
      firedForEndsAt.current = undefined
      return
    }
    if (state.isPaused || remainingSec > 0 || settings === undefined) return
    if (firedForEndsAt.current === state.endsAt) return
    firedForEndsAt.current = state.endsAt
    playFeedback(settings)
  }, [state, remainingSec, settings])

  if (state === undefined) return null

  return (
    <div className="rest-timer-bar" role="group" aria-label="Rest timer">
      <div className="rest-timer-bar__info">
        <p className="rest-timer-bar__label">{state.label}</p>
        <p className="rest-timer-bar__countdown" aria-live="polite">{formatDuration(remainingSec)}</p>
      </div>
      <div className="rest-timer-bar__controls">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { void (isRunning ? pause() : resume()) }}
        >
          {isRunning ? 'Pause' : 'Resume'}
        </Button>
        <Button variant="quiet" size="sm" onClick={() => { void add(-ADJUST_STEP_SEC) }}>-30s</Button>
        <Button variant="quiet" size="sm" onClick={() => { void add(ADJUST_STEP_SEC) }}>+30s</Button>
        <Button variant="quiet" size="sm" onClick={() => { void skip() }}>Skip</Button>
      </div>
    </div>
  )
}
