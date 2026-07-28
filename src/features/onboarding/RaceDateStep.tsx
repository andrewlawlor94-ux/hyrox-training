import type { ChangeEvent, FC } from 'react'
import { Button } from '@/components'
import type { AnchorResult, AnchorWarning } from '@/domain/planGeneration/anchor'

interface RaceDateStepProps {
  raceDate: string
  onChange: (value: string) => void
  anchor: AnchorResult | null
  error: string | null
  onContinue: () => void
}

/** Both name a real shortfall against the athlete's own choice, not just an
 * FYI — everything else `anchorPlan` can report (Base weeks filling the gap,
 * a deferred start) is informational, not a warning. */
const WARNING_KINDS = new Set<AnchorWarning>(['shortPlan', 'raceInPast'])

export const RaceDateStep: FC<RaceDateStepProps> = ({ raceDate, onChange, anchor, error, onContinue }) => {
  const isWarning = anchor !== null && anchor.warnings.some((warning) => WARNING_KINDS.has(warning))
  const showsDeferredDate = anchor !== null && anchor.warnings.includes('startDeferred') && anchor.deferredStartDate !== null

  return (
    <div className="onboarding-step">
      <h1 className="onboarding-step__heading">Race date</h1>
      <p className="onboarding-step__intro">
        When is your race? The 24-week plan is anchored backwards from this date, so week 24 always lands on race
        week.
      </p>

      <div className="onboarding-field">
        <label htmlFor="onboarding-race-date" className="onboarding-field__label">Race date</label>
        <input
          id="onboarding-race-date"
          type="date"
          className="onboarding-field__input"
          value={raceDate}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        />
      </div>

      {error ? <p className="onboarding-field__error" role="alert">{error}</p> : null}

      {anchor ? (
        <div className="onboarding-step__feedback" role="status">
          <p className={isWarning ? 'onboarding-step__warning' : 'onboarding-step__note'}>
            {isWarning ? 'Warning: ' : ''}
            {anchor.explanation}
          </p>
          {showsDeferredDate ? (
            <p className="onboarding-step__deferred-date">Plan starts {anchor.deferredStartDate}.</p>
          ) : null}
        </div>
      ) : null}

      <div className="onboarding-step__actions">
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </div>
  )
}
