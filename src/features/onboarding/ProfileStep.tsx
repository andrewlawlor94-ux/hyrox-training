import type { ChangeEvent, FC } from 'react'
import { Button, NumberField } from '@/components'

interface ProfileStepProps {
  age: number | null
  heightIn: number | null
  weightLb: number | null
  bodyFatPct: number | null
  considerations: string
  error: string | null
  onChangeAge: (value: number | null) => void
  onChangeHeight: (value: number | null) => void
  onChangeWeight: (value: number | null) => void
  onChangeBodyFat: (value: number | null) => void
  onChangeConsiderations: (value: string) => void
  onBack: () => void
  onContinue: () => void
}

/**
 * This is a public repository, and this profile is the athlete's own data:
 * every field starts empty (see `useOnboarding`'s `initialFields`), never
 * prefilled, and nothing entered here is ever committed to source control —
 * it lives only in this device's IndexedDB. Age, height, and weight are
 * required (load styles and guidance depend on them); body fat and
 * considerations are optional.
 */
export const ProfileStep: FC<ProfileStepProps> = ({
  age, heightIn, weightLb, bodyFatPct, considerations, error,
  onChangeAge, onChangeHeight, onChangeWeight, onChangeBodyFat, onChangeConsiderations,
  onBack, onContinue,
}) => (
  <div className="onboarding-step">
    <h1 className="onboarding-step__heading">Profile</h1>
    <p className="onboarding-step__intro">
      Nothing below is prefilled — these values are yours, and stay only on this device. Age, height, and weight
      are required; body fat and considerations are optional.
    </p>

    <NumberField id="onboarding-age" label="Age" unit="years" placeholder="e.g. 34" inputMode="numeric" value={age} onChange={onChangeAge} />
    <NumberField id="onboarding-height" label="Height" unit="in" placeholder="e.g. 70" value={heightIn} onChange={onChangeHeight} />
    <NumberField id="onboarding-weight" label="Weight" unit="lb" placeholder="e.g. 180" value={weightLb} onChange={onChangeWeight} />
    <NumberField id="onboarding-body-fat" label="Body fat" unit="%" placeholder="optional" value={bodyFatPct} onChange={onChangeBodyFat} />

    <div className="onboarding-field">
      <label htmlFor="onboarding-considerations" className="onboarding-field__label">Recurring considerations</label>
      <textarea
        id="onboarding-considerations"
        className="onboarding-field__textarea"
        placeholder="e.g. shin soreness after hard runs, occasional tightness (optional)"
        value={considerations}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChangeConsiderations(event.target.value)}
      />
    </div>

    {error ? <p className="onboarding-field__error" role="alert">{error}</p> : null}

    <div className="onboarding-step__actions">
      <Button variant="secondary" onClick={onBack}>Back</Button>
      <Button onClick={onContinue}>Continue</Button>
    </div>
  </div>
)
