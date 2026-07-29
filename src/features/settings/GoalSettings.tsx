import type { ChangeEvent, FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getActiveGoal, reanchorActivePlanToRaceDate, setRaceGoal } from '@/data/repositories'
import type { RaceGoal } from '@/data/types'
import { useToday } from '@/hooks/useToday'
import { anchorPlan } from '@/domain/planGeneration/anchor'
import type { ReanchorDecision } from '@/domain/planGeneration/reanchor'
import { goalTargets } from '@/domain/milestones/goalTargets'
import { formatDuration, formatPace, formatRaceTime, parseRaceTime } from '@/domain/units/format'

function logAndIgnore(err: unknown): void {
  console.error('Goal update failed', err)
}

/** Warnings from `anchorPlan` that mean "fewer than 24 weeks remain" rather
 * than a merely informational note — same distinction `RaceDateStep` (Task
 * 19) already draws. */
const SHORT_PLAN_WARNING = 'shortPlan'

/** Returns the re-anchor decision so the caller can tell the athlete what moved.
 * `reanchorActivePlanToRaceDate` runs `syncQueue` itself, so this does not. */
async function commitGoal(
  patch: { raceDate: string; targetSeconds: number; stretchSeconds: number },
  today: string,
): Promise<ReanchorDecision | null> {
  await setRaceGoal(patch, new Date().toISOString())
  return reanchorActivePlanToRaceDate({ today })
}

/**
 * Race date, target time, and stretch time (Settings-lite). Persists via
 * `setRaceGoal`, which appends `RACE_DATE_CHANGE` — followed here by
 * `syncQueue` so the schedule re-derives immediately rather than waiting for
 * the next unrelated write. Time fields commit on blur (matching
 * `NumberField`'s own resync-on-blur pattern) so a half-typed "1:3" is never
 * parsed mid-keystroke.
 */
export const GoalSettings: FC = () => {
  const today = useToday()
  const goal = useLiveQuery(() => getActiveGoal())
  const [targetText, setTargetText] = useState('')
  const [stretchText, setStretchText] = useState('')
  const [timeError, setTimeError] = useState<string | null>(null)
  const [dateWarning, setDateWarning] = useState<string | null>(null)
  // What the plan actually did in response to the new race date. Shown
  // separately from `dateWarning` (which is `anchorPlan`'s "under 24 weeks
  // remain" note) because they answer different questions: one is about the
  // runway, the other about which of the athlete's session dates just moved.
  const [reanchorNote, setReanchorNote] = useState<string | null>(null)
  // Guards the resync-from-`goal` effect below against clobbering
  // in-progress typing: committing ONE field (e.g. target, on blur) makes
  // `goal` re-emit from the live query while the OTHER field may still be
  // mid-edit, and an unconditional resync there dropped keystrokes —
  // verified failing before this guard was added. Same reasoning as
  // `NumberField`'s own focus-gated resync.
  const targetFocused = useRef(false)
  const stretchFocused = useRef(false)

  useEffect(() => {
    if (!goal) return
    if (!targetFocused.current) setTargetText(formatRaceTime(goal.targetSeconds))
    if (!stretchFocused.current) setStretchText(formatRaceTime(goal.stretchSeconds))
  }, [goal])

  function commitTimes(current: RaceGoal): void {
    const targetSeconds = parseRaceTime(targetText)
    const stretchSeconds = parseRaceTime(stretchText)
    if (targetSeconds === null || stretchSeconds === null) {
      setTimeError('Enter both times as H:MM:SS or MM:SS, e.g. 1:35:00.')
      return
    }
    setTimeError(null)
    // A time-only change cannot move race week, so no re-anchor note is shown.
    void commitGoal({ raceDate: current.raceDate, targetSeconds, stretchSeconds }, today).catch(logAndIgnore)
  }

  function handleRaceDateChange(event: ChangeEvent<HTMLInputElement>, current: RaceGoal): void {
    const raceDate = event.target.value
    if (!raceDate) return
    const anchor = anchorPlan({ today, raceDate })
    setDateWarning(anchor.warnings.includes(SHORT_PLAN_WARNING) ? anchor.explanation : null)
    setReanchorNote(null)
    void commitGoal({ raceDate, targetSeconds: current.targetSeconds, stretchSeconds: current.stretchSeconds }, today)
      .then((decision) => {
        // 'alreadyAligned' is the no-op case; saying "nothing changed" on every
        // trivial edit is noise.
        setReanchorNote(decision && decision.outcome !== 'alreadyAligned' ? decision.explanation : null)
      })
      .catch(logAndIgnore)
  }

  if (!goal) return null

  const previewTargetSeconds = parseRaceTime(targetText)
  const previewTargets = previewTargetSeconds !== null ? goalTargets(previewTargetSeconds) : null

  return (
    <section className="settings-screen__section">
      <h2>Race goal</h2>
      <div className="onboarding-field">
        <label htmlFor="settings-race-date" className="onboarding-field__label">Race date</label>
        <input
          id="settings-race-date"
          type="date"
          className="onboarding-field__input"
          // Floor the picker at today: a past race date is handled (anchorPlan
          // warns, `reanchorToRaceDate` reports "moved closer") but there is no
          // reason to let the control offer it in the first place.
          min={today}
          value={goal.raceDate}
          onChange={(event) => { handleRaceDateChange(event, goal) }}
        />
      </div>
      {dateWarning && <p className="onboarding-step__warning" role="alert">{dateWarning}</p>}
      {reanchorNote && <p className="onboarding-step__note" role="status">{reanchorNote}</p>}

      <div className="onboarding-field">
        <label htmlFor="settings-target-time" className="onboarding-field__label">Target time</label>
        <input
          id="settings-target-time"
          type="text"
          inputMode="numeric"
          placeholder="H:MM:SS"
          className="onboarding-field__input"
          value={targetText}
          onFocus={() => { targetFocused.current = true }}
          onChange={(event) => { setTargetText(event.target.value) }}
          onBlur={() => { targetFocused.current = false; commitTimes(goal) }}
        />
      </div>
      <div className="onboarding-field">
        <label htmlFor="settings-stretch-time" className="onboarding-field__label">Stretch time</label>
        <input
          id="settings-stretch-time"
          type="text"
          inputMode="numeric"
          placeholder="H:MM:SS"
          className="onboarding-field__input"
          value={stretchText}
          onFocus={() => { stretchFocused.current = true }}
          onChange={(event) => { setStretchText(event.target.value) }}
          onBlur={() => { stretchFocused.current = false; commitTimes(goal) }}
        />
      </div>
      {timeError && <p className="onboarding-field__error" role="alert">{timeError}</p>}

      {previewTargets && (
        <dl className="onboarding-step__milestones">
          <div className="onboarding-step__milestone">
            <dt>Compromised-km pace</dt>
            <dd>{formatPace(previewTargets.compromisedKmTargetSec)}</dd>
          </div>
          <div className="onboarding-step__milestone">
            <dt>Standalone 5 km</dt>
            <dd>{formatDuration(previewTargets.standalone5kTargetSec)}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}
