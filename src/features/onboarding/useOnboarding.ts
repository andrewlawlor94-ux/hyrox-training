import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { installSeedPlan, setRaceGoal, syncQueue, updateProfile, updateSettings } from '@/data/repositories'
import { anchorPlan } from '@/domain/planGeneration/anchor'
import type { AnchorResult } from '@/domain/planGeneration/anchor'
import { goalTargets } from '@/domain/milestones/goalTargets'
import type { GoalTargets } from '@/domain/milestones/goalTargets'
import { parseRaceTime } from '@/domain/units/format'
import type { AthleteProfile, ISODate } from '@/data/types'

export type OnboardingStep = 'raceDate' | 'profile' | 'goal'

/** Product defaults, not personal data — editable, and never anyone's real
 * race time. */
const DEFAULT_TARGET_TEXT = '1:35:00'
const DEFAULT_STRETCH_TEXT = '1:30:00'

export interface OnboardingFields {
  raceDate: string
  age: number | null
  heightIn: number | null
  weightLb: number | null
  bodyFatPct: number | null
  considerations: string
  targetText: string
  stretchText: string
}

function initialFields(): OnboardingFields {
  return {
    raceDate: '',
    age: null,
    heightIn: null,
    weightLb: null,
    bodyFatPct: null,
    considerations: '',
    targetText: DEFAULT_TARGET_TEXT,
    stretchText: DEFAULT_STRETCH_TEXT,
  }
}

/** Only the keys actually present get written — an explicit `undefined`
 * would violate `exactOptionalPropertyTypes` on `AthleteProfile`'s optional
 * fields, and a null/empty value here means "the athlete left it blank",
 * not "clear whatever was there". */
function buildProfilePatch(fields: OnboardingFields): Partial<AthleteProfile> {
  return {
    ...(fields.age !== null ? { age: fields.age } : {}),
    ...(fields.heightIn !== null ? { heightIn: fields.heightIn } : {}),
    ...(fields.weightLb !== null ? { weightLb: fields.weightLb } : {}),
    ...(fields.bodyFatPct !== null ? { bodyFatPct: fields.bodyFatPct } : {}),
    ...(fields.considerations !== '' ? { considerations: fields.considerations } : {}),
  }
}

export interface OnboardingApi {
  step: OnboardingStep
  fields: OnboardingFields
  setField: <K extends keyof OnboardingFields>(key: K, value: OnboardingFields[K]) => void
  raceDateError: string | null
  profileError: string | null
  goalError: string | null
  anchor: AnchorResult | null
  targets: GoalTargets | null
  isFinishing: boolean
  continueFromRaceDate: () => void
  continueFromProfile: () => void
  back: () => void
  finish: () => Promise<void>
}

/**
 * Holds all onboarding step/field state, derives the live race-date
 * anchoring feedback and goal milestones, and runs the finishing write
 * sequence (`updateProfile` -> `setRaceGoal` -> `installSeedPlan` ->
 * `updateSettings({ onboardingCompletedAt })` -> `syncQueue`) before
 * navigating to `/`. `today` is a parameter, never read from the clock
 * here — the caller (`OnboardingScreen`) gets it from `useToday`.
 */
export function useOnboarding(today: ISODate): OnboardingApi {
  const navigate = useNavigate()
  const [step, setStep] = useState<OnboardingStep>('raceDate')
  const [fields, setFields] = useState<OnboardingFields>(initialFields)
  const [raceDateError, setRaceDateError] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [goalError, setGoalError] = useState<string | null>(null)
  const [isFinishing, setIsFinishing] = useState(false)

  const setField = useCallback(<K extends keyof OnboardingFields>(key: K, value: OnboardingFields[K]) => {
    setFields((previous) => ({ ...previous, [key]: value }))
  }, [])

  const anchor = useMemo(
    () => (fields.raceDate ? anchorPlan({ today, raceDate: fields.raceDate }) : null),
    [today, fields.raceDate],
  )

  const targetSeconds = useMemo(() => parseRaceTime(fields.targetText), [fields.targetText])
  const stretchSeconds = useMemo(() => parseRaceTime(fields.stretchText), [fields.stretchText])
  const targets = useMemo(() => (targetSeconds !== null ? goalTargets(targetSeconds) : null), [targetSeconds])

  const continueFromRaceDate = useCallback(() => {
    if (!fields.raceDate) {
      setRaceDateError('Choose a race date to continue.')
      return
    }
    setRaceDateError(null)
    setStep('profile')
  }, [fields.raceDate])

  const continueFromProfile = useCallback(() => {
    if (fields.age === null || fields.heightIn === null || fields.weightLb === null) {
      setProfileError('Age, height, and weight are required to continue — they drive load styles and guidance.')
      return
    }
    setProfileError(null)
    setStep('goal')
  }, [fields.age, fields.heightIn, fields.weightLb])

  const back = useCallback(() => {
    setStep((current) => (current === 'goal' ? 'profile' : 'raceDate'))
  }, [])

  const finish = useCallback(async () => {
    if (targetSeconds === null || stretchSeconds === null) {
      setGoalError('Enter both times as H:MM:SS or MM:SS, e.g. 1:35:00.')
      return
    }
    setGoalError(null)
    setIsFinishing(true)
    try {
      const now = new Date().toISOString()
      await updateProfile(buildProfilePatch(fields), now)
      await setRaceGoal({ raceDate: fields.raceDate, targetSeconds, stretchSeconds }, now)
      await installSeedPlan({ today, raceDate: fields.raceDate, now })
      await updateSettings({ onboardingCompletedAt: now })
      await syncQueue(today)
      void navigate('/')
    } finally {
      setIsFinishing(false)
    }
  }, [fields, targetSeconds, stretchSeconds, today, navigate])

  return {
    step, fields, setField, raceDateError, profileError, goalError, anchor, targets, isFinishing,
    continueFromRaceDate, continueFromProfile, back, finish,
  }
}
