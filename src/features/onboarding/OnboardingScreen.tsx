import type { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { readSettings } from '@/data/repositories'
import { ImportBackupButton } from '@/features/backup/ImportBackupButton'
import { ImportConfirmSheet } from '@/features/backup/ImportConfirmSheet'
import { useImportBackup } from '@/features/backup/useImportBackup'
import { useToday } from '@/hooks/useToday'
import { useOnboarding } from './useOnboarding'
import { RaceDateStep } from './RaceDateStep'
import { ProfileStep } from './ProfileStep'
import { GoalStep } from './GoalStep'

/**
 * Three-step wizard (race date -> profile -> goal). All step/field state
 * and the finishing write sequence live in `useOnboarding`; this component
 * only picks which step to render and wires its callbacks.
 *
 * The first step also carries a restore-from-backup escape hatch (Task: fix
 * restore-before-onboarding). `AppShell` only gates the *main* app behind
 * `onboardingCompletedAt` — this route itself was always reachable pre-
 * onboarding, so it is the only place a fresh install, a new phone, or a
 * post-reset device can reach Import without a throwaway onboarding pass
 * first. It reuses `useImportBackup`/`ImportBackupButton` (the same
 * `validateBackup`/`importBackup` Settings' own Import control calls) rather
 * than a second import implementation. A restored backup was exported from
 * an already-configured install, so its `settings.onboardingCompletedAt` is
 * normally set; once `importBackup` writes it, this navigates to `/` itself
 * (the `/onboarding` route isn't behind `AppShell`'s gate, so nothing
 * redirects it there automatically). If a restored file somehow lacks it,
 * this stays on the race-date step with a note instead of bouncing the
 * athlete between an onboarding it can't complete and a home it can't reach.
 */
export const OnboardingScreen: FC = () => {
  const today = useToday()
  const navigate = useNavigate()
  const onboarding = useOnboarding(today)
  const { fields } = onboarding

  async function handleRestoredSuccessfully(): Promise<void> {
    const settings = await readSettings()
    if (settings.onboardingCompletedAt) void navigate('/')
  }

  const {
    message: restoreMessage, pending: restorePending, handleFileChange: handleRestoreFileChange,
    confirmImport: confirmRestore, cancelImport: cancelRestore,
  } = useImportBackup(() => { void handleRestoredSuccessfully() })

  if (onboarding.step === 'raceDate') {
    return (
      <>
        <RaceDateStep
          raceDate={fields.raceDate}
          onChange={(value) => onboarding.setField('raceDate', value)}
          anchor={onboarding.anchor}
          error={onboarding.raceDateError}
          onContinue={onboarding.continueFromRaceDate}
        />
        <div className="onboarding-restore">
          <p className="onboarding-restore__prompt">
            Already have a backup?
            <ImportBackupButton
              triggerLabel="Restore it instead"
              ariaLabel="Restore backup"
              onFileChange={handleRestoreFileChange}
            />
          </p>
          {restoreMessage ? <p role="status" className="onboarding-step__note">{restoreMessage}</p> : null}
        </div>
        <ImportConfirmSheet pending={restorePending} onConfirm={confirmRestore} onCancel={cancelRestore} />
      </>
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
