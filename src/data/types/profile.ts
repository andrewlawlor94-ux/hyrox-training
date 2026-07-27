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
  /**
   * The date the plan is anchored to: week 24 is always the race week. Always
   * present — onboarding requires choosing it, and every scheduling decision
   * derives from it. Whether an actual race is booked on that date is a
   * separate question the plan expresses through week 24's session content.
   */
  raceDate: ISODate
  targetSeconds: number
  stretchSeconds: number
  division: string
  isActive: boolean
  createdAt: ISOInstant
}
