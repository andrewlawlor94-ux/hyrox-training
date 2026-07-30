import type { FC } from 'react'
import type { Exercise, InstancePrescription } from '@/data/types'
import type { StrengthRecommendation } from '@/domain/recommendations/strengthTarget'
import { formatLoad } from '@/domain/units/format'
import { Button } from '@/components'
import { SHORT_MONTH_NAMES } from './constants'
import { hasUnknownLoad, targetLoadLabel } from './loadPresentation'

interface TargetHeaderProps {
  exercise: Exercise
  prescription: InstancePrescription
  recommendation: StrengthRecommendation
  targetReps: number
  onUseTarget: () => void
  /** Opens this exercise's own adjust-the-workout sheet. Absent when the
   * instance is frozen — completed history is not adjustable, and a tappable
   * name that refused to open anything would be worse than a plain one. */
  onOpenSettings?: () => void
}

/** 'YYYY-MM-DD' -> 'Jul 20'. Hand-rolled (see SHORT_MONTH_NAMES) rather than
 * `toLocaleDateString`, which varies by environment/locale. */
function formatShortDate(date: string): string {
  const parts = date.split('-')
  const month = Number(parts[1])
  const day = Number(parts[2])
  const abbreviation = SHORT_MONTH_NAMES[month - 1] ?? ''
  return `${abbreviation} ${String(day)}`
}

/**
 * The prescribed sets/reps, with the plan's target RIR folded onto the same
 * line (`4 × 4–6 · target RIR 2`) rather than a whole new line of prose per
 * exercise (§ target RIR fix) — guidance only, never a prefill; see
 * `Prescription.targetRir`'s doc comment. Omitted entirely when the
 * prescription carries none (a station, a body-weight movement, etc.).
 */
function repRangeLabel(prescription: InstancePrescription, exercise: Exercise): string {
  const sets = prescription.sets ?? exercise.defaultSets ?? 0
  const repMin = prescription.repMin ?? exercise.repMin
  const repMax = prescription.repMax ?? exercise.repMax
  const base = repMin === undefined
    ? `${String(sets)} sets`
    : `${String(sets)} × ${repMax !== undefined && repMax !== repMin ? `${String(repMin)}–${String(repMax)}` : String(repMin)}`
  return prescription.targetRir !== undefined ? `${base} · target RIR ${String(prescription.targetRir)}` : base
}

/**
 * Everything the athlete needs to see about a strength exercise WITHOUT
 * tapping anything (§8): name, prescribed sets/reps, most recent performance
 * and its date, last week's weight when one exists, today's target, and the
 * one-sentence reason. Never a prefill by itself — `onUseTarget` is the only
 * thing here that writes, and only on an explicit tap.
 */
export const TargetHeader: FC<TargetHeaderProps> = ({ exercise, prescription, recommendation, targetReps, onUseTarget, onOpenSettings }) => {
  const unknownLoad = hasUnknownLoad(exercise, recommendation)
  const settingsHintId = `${prescription.id}-settings-hint`

  return (
    <div className="target-header">
      <div className="target-header__title-row">
        {/* The exercise NAME is the way into its settings (athlete: "make it so
            I can click an exercise in the workout and get brought to the page to
            adjust workout specific settings"). A real <button> inside the <h3>
            rather than a click handler on the heading, so it is reachable by
            keyboard and announced as a control — the heading itself stays the
            heading for navigation. */}
        {/* The button's accessible name is EXACTLY the exercise name, and its
            purpose is carried by `aria-describedby` instead.
            `aria-label`/inner text both feed the <h3>'s own accessible name (a
            heading is named from its descendants), so anything extra in there
            turned "Back squat" into "Back squat — adjust this exercise": noise
            for anyone navigating by heading, and it silently broke selectors
            matching the heading exactly. A DESCRIPTION does not affect naming,
            which is precisely why it is the right tool here. */}
        <h3 className="target-header__name">
          {onOpenSettings === undefined ? exercise.name : (
            <button
              type="button"
              className="target-header__name-button"
              aria-describedby={settingsHintId}
              onClick={onOpenSettings}
            >
              {exercise.name}
            </button>
          )}
        </h3>
        {onOpenSettings !== undefined && (
          <span id={settingsHintId} className="visually-hidden">Opens this exercise&apos;s settings</span>
        )}
        {onOpenSettings !== undefined && (
          <span className="target-header__name-hint" aria-hidden="true">Adjust</span>
        )}
        <span className="target-header__scheme">{repRangeLabel(prescription, exercise)}</span>
      </div>
      {recommendation.previous && (
        <p className="target-header__line">
          {`Last: ${formatLoad(recommendation.previous.load)} × ${String(recommendation.previous.reps)} · ${formatShortDate(recommendation.previous.date)}`}
        </p>
      )}
      {recommendation.lastWeek && (
        <p className="target-header__line">{`Last week: ${formatLoad(recommendation.lastWeek.load)}`}</p>
      )}
      <div className="target-header__target-row">
        {unknownLoad ? (
          <p className="target-header__line target-header__target">
            {`Today's target: ${String(targetReps)} reps · set your own load`}
          </p>
        ) : (
          <>
            <p className="target-header__line target-header__target">
              {`Today's target: ${targetLoadLabel(exercise, recommendation)} × ${String(targetReps)}`}
              {recommendation.isOptionalAim ? ' (optional aim)' : ''}
            </p>
            <Button variant="secondary" size="sm" onClick={onUseTarget}>Use target</Button>
          </>
        )}
      </div>
      <p className="target-header__reason">{recommendation.reason}</p>
    </div>
  )
}
