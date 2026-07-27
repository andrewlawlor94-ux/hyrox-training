import type { ScheduleOverride } from '@/domain/types'
import type { EligibilityResult } from './eligibility'

/** The override that currently pins `templateId`, if any — the most
 * recently created pinned override wins when more than one exists. Ties on
 * `createdAt` are broken by `id` (greatest wins) so the result can never
 * depend on `overrides` array order. */
export function activePin(overrides: ScheduleOverride[], templateId: string): ScheduleOverride | null {
  let best: ScheduleOverride | null = null
  for (const o of overrides) {
    if (o.instanceId !== templateId || !o.isPinned) continue
    if (best === null) { best = o; continue }
    if (o.createdAt > best.createdAt) { best = o; continue }
    if (o.createdAt === best.createdAt && o.id > best.id) best = o
  }
  return best
}

const BLOCKED_BY_NOTE: Record<NonNullable<EligibilityResult['blockedBy']>, string> = {
  dayOccupied: 'This date already has another session scheduled.',
  restDayRule: "This date would remove this week's only rest day.",
  recoveryConflict: "This date conflicts with a neighbouring session's recovery needs.",
  pastRaceDate: 'This date falls after the race date.',
}

/** Manual moves bypass hard conflicts but record every violated rule as a
 * plain-language note rather than silently ignoring it (§15). */
export function pinSoftConflicts(evaluation: EligibilityResult): string[] {
  const notes = evaluation.conflicts.map((c) => c.reason)
  if (evaluation.blockedBy !== null) notes.push(BLOCKED_BY_NOTE[evaluation.blockedBy])
  return notes
}
