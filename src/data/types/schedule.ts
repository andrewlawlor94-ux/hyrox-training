import type { ISODate, ISOInstant } from './primitives'
import type { ScheduleEventType } from './enums'

/** Append-only journal entry. Never mutated; recomputation replays the full
 * event log in `at` order. `payload` must stay flat and JSON-serializable so
 * it survives backup export/import unchanged. */
export interface ScheduleEvent {
  id: string
  at: ISOInstant
  type: ScheduleEventType
  instanceId?: string
  payload: Record<string, string | number | boolean | null>
}

/** A pinned/forced placement for a specific instance on a specific date. */
export interface ScheduleOverride {
  id: string
  instanceId: string
  date: ISODate
  isPinned: boolean
  createdAt: ISOInstant
}

/** Plain-language reason the queue engine attaches to an instance whose
 * schedule or status changed from what the template alone would produce. */
export interface QueueExplanation {
  id: string
  instanceId?: string
  weekNumber?: number
  at: ISOInstant
  kind: string
  text: string
}
