import type { ChangeEvent, FC } from 'react'
import { Button } from '@/components'
import type { GoalTargets } from '@/domain/milestones/goalTargets'
import { formatDuration, formatPace } from '@/domain/units/format'

interface RaceTimeFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}

/**
 * No existing primitive covers "H:MM:SS free-text race time", so this
 * reuses NumberField's own CSS classes (same ≥44px control, same
 * ≥16px font-size from the global `input` rule) rather than inventing new
 * styling for a one-off shape.
 */
const RaceTimeField: FC<RaceTimeFieldProps> = ({ id, label, value, onChange }) => (
  <div className="number-field">
    <label htmlFor={id} className="number-field__label">{label}</label>
    <div className="number-field__control">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="H:MM:SS"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        className="number-field__input"
      />
    </div>
  </div>
)

interface GoalStepProps {
  targetText: string
  stretchText: string
  targets: GoalTargets | null
  error: string | null
  isFinishing: boolean
  onChangeTarget: (value: string) => void
  onChangeStretch: (value: string) => void
  onBack: () => void
  onFinish: () => void
}

/**
 * Derived milestones (compromised-km pace, standalone 5 km) recompute from
 * `targets`, which `useOnboarding` re-derives via `goalTargets` on every
 * keystroke in the target field — so this component itself does no
 * derivation, only display.
 */
export const GoalStep: FC<GoalStepProps> = ({
  targetText, stretchText, targets, error, isFinishing, onChangeTarget, onChangeStretch, onBack, onFinish,
}) => (
  <div className="onboarding-step">
    <h1 className="onboarding-step__heading">Goal</h1>
    <p className="onboarding-step__intro">
      Set a target and stretch finish time. Both default to sensible values and can be changed later in Settings.
    </p>

    <RaceTimeField id="onboarding-target-time" label="Target time" value={targetText} onChange={onChangeTarget} />
    <RaceTimeField id="onboarding-stretch-time" label="Stretch time" value={stretchText} onChange={onChangeStretch} />

    {targets ? (
      <dl className="onboarding-step__milestones">
        <div className="onboarding-step__milestone">
          <dt>Compromised-km pace</dt>
          <dd>{formatPace(targets.compromisedKmTargetSec)}</dd>
        </div>
        <div className="onboarding-step__milestone">
          <dt>Standalone 5 km</dt>
          <dd>{formatDuration(targets.standalone5kTargetSec)}</dd>
        </div>
      </dl>
    ) : null}

    {error ? <p className="onboarding-field__error" role="alert">{error}</p> : null}

    <div className="onboarding-step__actions">
      <Button variant="secondary" onClick={onBack}>Back</Button>
      <Button onClick={onFinish} disabled={isFinishing}>Finish</Button>
    </div>
  </div>
)
