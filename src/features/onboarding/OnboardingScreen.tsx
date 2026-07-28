import type { FC } from 'react'
import { useToday } from '@/hooks/useToday'
import { useOnboarding } from './useOnboarding'
import { RaceDateStep } from './RaceDateStep'
import { ProfileStep } from './ProfileStep'
import { GoalStep } from './GoalStep'

/**
 * Three-step wizard (race date -> profile -> goal). All step/field state
 * and the finishing write sequence live in `useOnboarding`; this component
 * only picks which step to render and wires its callbacks.
 */
export const OnboardingScreen: FC = () => {
  const today = useToday()
  const onboarding = useOnboarding(today)
  const { fields } = onboarding

  if (onboarding.step === 'raceDate') {
    return (
      <RaceDateStep
        raceDate={fields.raceDate}
        onChange={(value) => onboarding.setField('raceDate', value)}
        anchor={onboarding.anchor}
        error={onboarding.raceDateError}
        onContinue={onboarding.continueFromRaceDate}
      />
    )
  }

  if (onboarding.step === 'profile') {
    return (
      <ProfileStep
        age={fields.age}
        heightIn={fields.heightIn}
        weightLb={fields.weightLb}
        bodyFatPct={fields.bodyFatPct}
        considerations={fields.considerations}
        error={onboarding.profileError}
        onChangeAge={(value) => onboarding.setField('age', value)}
        onChangeHeight={(value) => onboarding.setField('heightIn', value)}
        onChangeWeight={(value) => onboarding.setField('weightLb', value)}
        onChangeBodyFat={(value) => onboarding.setField('bodyFatPct', value)}
        onChangeConsiderations={(value) => onboarding.setField('considerations', value)}
        onBack={onboarding.back}
        onContinue={onboarding.continueFromProfile}
      />
    )
  }

  return (
    <GoalStep
      targetText={fields.targetText}
      stretchText={fields.stretchText}
      targets={onboarding.targets}
      error={onboarding.goalError}
      isFinishing={onboarding.isFinishing}
      onChangeTarget={(value) => onboarding.setField('targetText', value)}
      onChangeStretch={(value) => onboarding.setField('stretchText', value)}
      onBack={onboarding.back}
      onFinish={() => { void onboarding.finish() }}
    />
  )
}
