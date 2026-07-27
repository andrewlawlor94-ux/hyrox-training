import type { ISODate, RecoveryTag, ScheduleEvent, ScheduleEventType } from '@/domain/types'
import type { QueueInput, QueueTemplate } from '../recompute'

export const PLAN_START = '2026-08-03' // a Monday
export const RACE_DATE = '2027-01-16'

/** Standard 6-slot week matching the plan's default weekly structure (§19). */
export function weekTemplates(weekNumber: number): QueueTemplate[] {
  return [
    { templateId: `w${String(weekNumber)}s1`, weekNumber, sessionSlot: 1, sequenceInWeek: 0, priority: 'essential', recoveryTags: ['lowerBodyStrength', 'highImpactStation'], name: 'Strength A + sled' },
    { templateId: `w${String(weekNumber)}s2`, weekNumber, sessionSlot: 2, sequenceInWeek: 1, priority: 'essential', recoveryTags: ['easyRun'], name: 'Easy run + durability' },
    { templateId: `w${String(weekNumber)}s3`, weekNumber, sessionSlot: 3, sequenceInWeek: 2, priority: 'optional', recoveryTags: ['lowImpactAerobic'], name: 'Zone 2' },
    { templateId: `w${String(weekNumber)}s4`, weekNumber, sessionSlot: 4, sequenceInWeek: 3, priority: 'essential', recoveryTags: ['hardRun', 'highImpactStation'], name: 'Quality run' },
    { templateId: `w${String(weekNumber)}s5`, weekNumber, sessionSlot: 5, sequenceInWeek: 4, priority: 'essential', recoveryTags: ['upperBodyStrength', 'hybrid'], name: 'Strength B + stations' },
    { templateId: `w${String(weekNumber)}s6`, weekNumber, sessionSlot: 6, sequenceInWeek: 5, priority: 'important', recoveryTags: ['longRun'], name: 'Long run' },
  ]
}

let eventSeq = 0
export function event(type: ScheduleEventType, templateId: string | null, at: string, payload: Record<string, string | number | boolean | null> = {}): ScheduleEvent {
  eventSeq += 1
  return { id: `ev_${String(eventSeq)}`, at, type, ...(templateId === null ? {} : { instanceId: templateId }), payload }
}

export function input(over: Partial<QueueInput> = {}): QueueInput {
  return {
    planStartDate: PLAN_START, raceDate: RACE_DATE,
    templates: weekTemplates(1), events: [], overrides: [], today: PLAN_START,
    ...over,
  }
}

/** A template that is immediately completed on its own `forDate`, purely to
 * occupy that calendar day as a dense, inert wall for building multi-week
 * shortfall scenarios (used by the essential-bump fallback tests) without
 * depending on any other session's own placement. Tags default to a type
 * with no recovery-matrix rows so it doesn't accidentally introduce a
 * conflict unless the caller asks for one. */
export function fillerSession(
  id: string, weekNumber: number, slot: number, forDate: ISODate, tags: RecoveryTag[] = ['recovery'],
): { template: QueueTemplate; occupyingEvent: ScheduleEvent } {
  return {
    template: { templateId: id, weekNumber, sessionSlot: slot, sequenceInWeek: slot - 1, priority: 'optional', recoveryTags: tags, name: `Filler ${id}` },
    occupyingEvent: event('COMPLETE', id, `${forDate}T18:00:00.000Z`, { forDate }),
  }
}
