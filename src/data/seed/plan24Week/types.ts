import type { LoadStyle, PaceSource, Priority, RecoveryTag, Unit, WorkoutKind } from '@/data/types'

/**
 * Structure of an interval-based run prescription (e.g. 8x1km), mirroring
 * `IntervalSpec` in the entity model (Task 3) so a seed prescription can be
 * loaded straight into a real `Prescription` row without reshaping.
 */
export interface SeedIntervalSpec {
  warmupSec?: number
  reps: number
  workSec?: number
  workDistanceM?: number
  recoverySec: number
  cooldownSec?: number
}

/**
 * A single exercise/run/station line within a `SeedTemplate`. Shaped to drop
 * straight into a `Prescription` row (minus the `id`/`templateId` that only
 * exist once the plan is actually instantiated by Task 16's repositories).
 *
 * `paceSource: 'goalRacePace'` means `targetPaceSecPerKm` is deliberately
 * omitted -- the real pace is resolved at read time from the athlete's active
 * goal, so changing the goal updates every future race-pace session without
 * touching this seed data. A hand-edited prescription flips to `'manual'`.
 */
export interface SeedPrescription {
  exerciseId: string
  order: number
  sets?: number
  repMin?: number
  repMax?: number
  targetLoad?: number
  loadUnit?: Unit
  loadStyle?: LoadStyle
  distanceM?: number
  durationSec?: number
  targetPaceSecPerKm?: number
  paceSource?: PaceSource
  restSec: number
  intervalSpec?: SeedIntervalSpec
  notes?: string
}

/** One of the plan's six weekly session slots (§8/§19). */
export interface SeedTemplate {
  /** 1..6 */
  sessionSlot: number
  /** 0-based, contiguous within the week. */
  sequenceInWeek: number
  name: string
  kind: WorkoutKind
  priority: Priority
  recoveryTags: RecoveryTag[]
  estMinutes: number
  notes?: string
  /** Percent of full HYROX station volume for this session, where applicable. */
  stationVolumePct?: number
  prescriptions: SeedPrescription[]
}

/** One week of the 24-week plan. */
export interface SeedWeek {
  weekNumber: number
  phaseName: string
  label: string
  isDeload: boolean
  notes?: string
  templates: SeedTemplate[]
}

/** One of the plan's five training phases (§19). */
export interface SeedPhase {
  name: string
  weekStart: number
  weekEnd: number
  focus: string
}
