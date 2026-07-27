import type { ISODate, ISOInstant, Unit } from './primitives'

/** Singleton settings row, id: 'app'. */
export interface AppSettings {
  id: 'app'
  schemaVersion: number
  activePlanId: string
  strengthUnit: Unit
  stationUnit: Unit
  restSoundEnabled: boolean
  restVibrationEnabled: boolean
  /** Absent until the first backup export. */
  lastBackupAt?: ISOInstant
  /** Absent until the onboarding wizard finishes. */
  onboardingCompletedAt?: ISOInstant
  dismissedSubstitutions: string[]
}

/** Singleton athlete profile row, id: 'me'. Onboarding fields are skippable,
 * so the personal-detail fields stay optional — the row exists before it has
 * values. */
export interface AthleteProfile {
  id: 'me'
  age?: number
  heightIn?: number
  weightLb?: number
  bodyFatPct?: number
  trainingBackground?: string
  considerations?: string
  updatedAt: ISOInstant
}

export interface RaceGoal {
  id: string
  /** Absent when training toward the plan's end without a booked race. */
  raceDate?: ISODate
  targetSeconds: number
  stretchSeconds: number
  division: string
  isActive: boolean
  createdAt: ISOInstant
}
