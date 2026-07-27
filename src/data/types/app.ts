import type { ISOInstant, JsonValue } from './primitives'
import type { MilestoneKey, MilestoneStatus } from './enums'

/**
 * Singleton rest-timer row, id: 'active'. Storing an absolute end timestamp
 * (`endsAt`) rather than a countdown is what makes the timer survive
 * navigation, screen lock, and refresh — remaining time is always
 * `endsAt − now`. Pausing clears `endsAt` and stores `pausedRemainingSec`
 * instead.
 */
export interface RestTimerState {
  id: 'active'
  exerciseId?: string
  label: string
  endsAt?: ISOInstant
  pausedRemainingSec?: number
  isPaused: boolean
  totalSec: number
  startedAt: ISOInstant
}

export interface MilestoneRecord {
  id: string
  key: MilestoneKey
  label: string
  status: MilestoneStatus
  /** Absent until the milestone is achieved. */
  achievedAt?: ISOInstant
  evidence: Record<string, JsonValue>
  targetWeek: number
}

/** Singleton pre-import safety snapshot, id: 'pre-import'. Keeps exactly one
 * — overwritten on each import, never accumulated. */
export interface SafetyBackup {
  id: 'pre-import'
  at: ISOInstant
  json: string
}
