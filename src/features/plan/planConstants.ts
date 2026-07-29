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

const DONE_STATUSES: readonly WorkoutStatus[] = ['completed', 'partiallyCompleted', 'skipped', 'autoDropped']
const ACTIVE_STATUSES: readonly WorkoutStatus[] = ['available', 'inProgress']

export type WeekProgress = 'completed' | 'inProgress' | 'upcoming'

/** A week's overall completion state, derived from its sessions' statuses --
 * never a fabricated "on schedule" judgment, purely what's actually
 * recorded. Empty weeks (no sessions materialized) read as `upcoming`. */
export function weekProgress(statuses: WorkoutStatus[]): WeekProgress {
  if (statuses.length > 0 && statuses.every((s) => DONE_STATUSES.includes(s))) return 'completed'
  if (statuses.some((s) => DONE_STATUSES.includes(s) || ACTIVE_STATUSES.includes(s))) return 'inProgress'
  return 'upcoming'
}
