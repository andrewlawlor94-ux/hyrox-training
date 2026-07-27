import type { ISODate, ScheduleEvent, ScheduleEventType, WorkoutStatus } from '@/domain/types'
import type { QueueTemplate } from './recompute'

/** Statuses that freeze an instance's placement — recomputation never moves
 * these regardless of today, occupancy, or anything else (§15). `autoDropped`
 * is assigned by the placement phase itself, not by event replay, so it is
 * handled separately from this event-derived set. */
export const EVENT_TERMINAL_STATUSES: readonly WorkoutStatus[] = ['completed', 'partiallyCompleted', 'skipped']

export interface InstanceState {
  status: WorkoutStatus
  completedForDate: ISODate | null
  isManualOverride: boolean
  /** True when an explicit DEFER event is the most recent thing that
   * happened to this instance — it must land on a day different from its
   * planned date, not merely an eligible one. */
  deferralRequested: boolean
}

/** Stable sort by `at`, then `id` as a tiebreaker, so array order can never
 * change the outcome — the determinism the "reversed event array" test pins. */
export function sortEvents(events: ScheduleEvent[]): ScheduleEvent[] {
  return [...events].sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1
    if (a.id === b.id) return 0
    return a.id < b.id ? -1 : 1
  })
}

/** Finds the last RESET_RECOMMENDATIONS event and discards every MOVE/DEFER
 * at or before it, while keeping every completion (and the control event
 * itself is dropped — it carries no per-instance state of its own). This
 * resets automated recommendations without erasing history. */
export function effectiveEvents(sorted: ScheduleEvent[]): ScheduleEvent[] {
  let lastResetIndex = -1
  sorted.forEach((e, idx) => {
    if (e.type === 'RESET_RECOMMENDATIONS') lastResetIndex = idx
  })
  return sorted.filter((e, idx) => {
    if (e.type === 'RESET_RECOMMENDATIONS') return false
    const isDiscardable: ScheduleEventType[] = ['MOVE', 'DEFER']
    if (isDiscardable.includes(e.type) && idx <= lastResetIndex) return false
    return true
  })
}

function readStringPayload(payload: Record<string, string | number | boolean | null>, key: string): ISODate | null {
  const value = payload[key]
  return typeof value === 'string' ? value : null
}

/** Replays the effective event history into one working state per template.
 * Later events (by the sort above) win over earlier ones for the same
 * instance, matching append-only journal replay semantics. */
export function applyEvents(templates: QueueTemplate[], events: ScheduleEvent[]): Map<string, InstanceState> {
  const states = new Map<string, InstanceState>()
  for (const t of templates) {
    states.set(t.templateId, { status: 'upcoming', completedForDate: null, isManualOverride: false, deferralRequested: false })
  }

  for (const e of events) {
    if (e.instanceId === undefined) continue
    const state = states.get(e.instanceId)
    if (state === undefined) continue

    if (e.type === 'COMPLETE' || e.type === 'COMPLETE_EARLIER') {
      state.status = 'completed'
      state.completedForDate = readStringPayload(e.payload, 'forDate')
      state.deferralRequested = false
    } else if (e.type === 'PARTIAL') {
      state.status = 'partiallyCompleted'
      state.completedForDate = readStringPayload(e.payload, 'forDate')
      state.deferralRequested = false
    } else if (e.type === 'SKIP') {
      state.status = 'skipped'
      state.completedForDate = null
      state.deferralRequested = false
    } else if (e.type === 'DEFER') {
      state.status = 'deferred'
      state.deferralRequested = true
    } else if (e.type === 'MOVE') {
      state.isManualOverride = true
      state.deferralRequested = false
    }
    // PLAN_EDIT / RACE_DATE_CHANGE affect the templates/raceDate this module
    // is handed, not per-instance status — no-op here.
  }
  return states
}
