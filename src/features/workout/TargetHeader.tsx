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

function repRangeLabel(prescription: InstancePrescription, exercise: Exercise): string {
  const sets = prescription.sets ?? exercise.defaultSets ?? 0
  const repMin = prescription.repMin ?? exercise.repMin
  const repMax = prescription.repMax ?? exercise.repMax
  if (repMin === undefined) return `${String(sets)} sets`
  const repLabel = repMax !== undefined && repMax !== repMin ? `${String(repMin)}–${String(repMax)}` : String(repMin)
  return `${String(sets)} × ${repLabel}`
}

/**
 * Everything the athlete needs to see about a strength exercise WITHOUT
 * tapping anything (§8): name, prescribed sets/reps, most recent performance
 * and its date, last week's weight when one exists, today's target, and the
 * one-sentence reason. Never a prefill by itself — `onUseTarget` is the only
 * thing here that writes, and only on an explicit tap.
 */
export const TargetHeader: FC<TargetHeaderProps> = ({ exercise, prescription, recommendation, targetReps, onUseTarget }) => {
  const unknownLoad = hasUnknownLoad(exercise, recommendation)

  return (
    <div className="target-header">
      <div className="target-header__title-row">
        <h3 className="target-header__name">{exercise.name}</h3>
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
