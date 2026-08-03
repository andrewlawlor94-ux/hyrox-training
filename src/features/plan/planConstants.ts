import type { Priority, WorkoutKind, WorkoutStatus } from '@/data/types'
import type { ChipTone } from '@/components'

export const WORKOUT_KIND_OPTIONS: { value: WorkoutKind; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'run', label: 'Run' },
  { value: 'zone2', label: 'Zone 2' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'simulation', label: 'Simulation' },
  { value: 'race', label: 'Race' },
  { value: 'recovery', label: 'Recovery' },
]

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'essential', label: 'Essential' },
  { value: 'important', label: 'Important' },
  { value: 'optional', label: 'Optional' },
]

/** Plain-language label for a session's status — always paired with a Chip
 * tone, never colour alone. */
export const STATUS_LABEL: Record<WorkoutStatus, string> = {
  upcoming: 'Upcoming',
  available: 'Ready today',
  inProgress: 'In progress',
  completed: 'Completed',
  partiallyCompleted: 'Partially completed',
  deferred: 'Deferred',
  skipped: 'Skipped',
  autoDropped: 'Dropped',
}

export const STATUS_TONE: Record<WorkoutStatus, ChipTone> = {
  upcoming: 'neutral',
  available: 'accent',
  inProgress: 'accent',
  completed: 'green',
  partiallyCompleted: 'caution',
  deferred: 'caution',
  skipped: 'neutral',
  autoDropped: 'elevated',
}

/** Statuses that mean the athlete actually ATTENDED the session. */
const ATTENDED_STATUSES: readonly WorkoutStatus[] = ['completed', 'partiallyCompleted']
/** Terminal but NOT attended: the session is settled and will not happen. */
const UNATTENDED_TERMINAL_STATUSES: readonly WorkoutStatus[] = ['skipped', 'autoDropped']
const SETTLED_STATUSES: readonly WorkoutStatus[] = [...ATTENDED_STATUSES, ...UNATTENDED_TERMINAL_STATUSES]
const ACTIVE_STATUSES: readonly WorkoutStatus[] = ['available', 'inProgress']

export type WeekProgress = 'completed' | 'dropped' | 'inProgress' | 'upcoming'

/**
 * A week's overall state, derived from its sessions' statuses -- never a
 * fabricated "on schedule" judgment, purely what's actually recorded. Empty
 * weeks (no sessions materialized) read as `upcoming`.
 *
 * `dropped` exists because reporting a week of entirely auto-dropped sessions as
 * "Done" was actively misleading, and the athlete caught it: after a race date
 * moved closer, sixteen weeks that fell past race day were all auto-dropped and
 * the Plan tab labelled every one of them "Done". Nothing in them happened.
 * A week only reads as completed if at least one session was genuinely attended.
 *
 * `inProgress` likewise requires a session that was ATTENDED or is active
 * today — a week has not started just because one of its sessions was dropped.
 * Seen in the browser on race week, twenty weeks out: three of its four sessions
 * fall after race day and are auto-dropped, and the week was labelled "In
 * progress" as a result. Nothing about it had begun.
 */
export function weekProgress(statuses: WorkoutStatus[]): WeekProgress {
  if (statuses.length === 0) return 'upcoming'
  const allSettled = statuses.every((s) => SETTLED_STATUSES.includes(s))
  const anyAttended = statuses.some((s) => ATTENDED_STATUSES.includes(s))
  if (allSettled) return anyAttended ? 'completed' : 'dropped'
  if (anyAttended || statuses.some((s) => ACTIVE_STATUSES.includes(s))) return 'inProgress'
  return 'upcoming'
}
