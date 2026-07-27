import type { ISODate, Priority, RecoveryTag, ScheduleEvent, ScheduleOverride, WorkoutStatus } from '@/domain/types'
import { addDays } from '@/domain/dates'
import type { OccupiedDay } from './eligibility'
import { isDayEligible } from './eligibility'
import type { OpenInstance } from './placement'
import { placeOpenInstances } from './placement'
import { DAYS_PER_WEEK, SLOT_DAY_OFFSET } from './constants'
import { activePin, pinSoftConflicts } from './pins'
import type { InstanceState } from './replay'
import { applyEvents, effectiveEvents, EVENT_TERMINAL_STATUSES, sortEvents } from './replay'

/** The immutable definition of one planned session, independent of any event history. */
export interface QueueTemplate {
  templateId: string
  weekNumber: number
  sessionSlot: number
  sequenceInWeek: number
  priority: Priority
  recoveryTags: RecoveryTag[]
  name: string
}

export interface QueueInput {
  planStartDate: ISODate
  raceDate: ISODate
  templates: QueueTemplate[]
  events: ScheduleEvent[] // any order; sorted internally by `at`
  overrides: ScheduleOverride[]
  today: ISODate
}

export interface ScheduledInstance {
  templateId: string
  weekNumber: number
  sessionSlot: number
  sequence: number
  name: string
  priority: Priority
  recoveryTags: RecoveryTag[]
  plannedDate: ISODate
  scheduledDate: ISODate | null // null when dropped or skipped
  status: WorkoutStatus
  completedForDate: ISODate | null
  isManualOverride: boolean
  adjustmentReason: string | null
  softConflicts: string[]
}

export interface QueueResult {
  instances: ScheduledInstance[]
  explanations: { templateId: string | null; weekNumber: number | null; text: string }[]
  dropped: { templateId: string; priority: Priority; reason: string }[]
}

function plannedDateFor(template: QueueTemplate, planStartDate: ISODate): ISODate {
  const offset = SLOT_DAY_OFFSET[template.sessionSlot] ?? 0
  return addDays(planStartDate, (template.weekNumber - 1) * DAYS_PER_WEEK + offset)
}

/** Phase 1-2: sort templates deterministically and replay the effective
 * event history into one working state per template (materialize + event
 * ordering + RESET_RECOMMENDATIONS handling all happen inside `replay.ts`). */
function prepare(input: QueueInput) {
  const templates = [...input.templates].sort((a, b) => a.weekNumber - b.weekNumber || a.sequenceInWeek - b.sequenceInWeek)
  const states = applyEvents(templates, effectiveEvents(sortEvents(input.events)))
  return { templates, states }
}

/** Phase 3: frozen (event-terminal) instances occupy their date first, then
 * pinned overrides occupy theirs and skip eligibility entirely — manual
 * moves bypass hard conflicts but record every violated rule (`pins.ts`). */
function buildOccupiedAndPins(
  templates: QueueTemplate[],
  states: Map<string, InstanceState>,
  overrides: ScheduleOverride[],
  raceDate: ISODate,
) {
  const occupied: OccupiedDay[] = []
  const pinnedDate = new Map<string, ISODate>()
  const pinnedNotes = new Map<string, string[]>()

  for (const t of templates) {
    const state = states.get(t.templateId)
    if (state === undefined || !EVENT_TERMINAL_STATUSES.includes(state.status)) continue
    const scheduledDate = state.status === 'skipped' ? null : state.completedForDate
    if (scheduledDate !== null) occupied.push({ date: scheduledDate, tags: [...t.recoveryTags] })
  }

  for (const t of templates) {
    const state = states.get(t.templateId)
    if (state === undefined || EVENT_TERMINAL_STATUSES.includes(state.status)) continue
    const pin = activePin(overrides, t.templateId)
    if (pin === null) continue
    const evaluation = isDayEligible({ candidate: pin.date, candidateTags: t.recoveryTags, occupied, raceDate })
    pinnedNotes.set(t.templateId, pinSoftConflicts(evaluation))
    pinnedDate.set(t.templateId, pin.date)
    occupied.push({ date: pin.date, tags: [...t.recoveryTags] })
  }

  return { occupied, pinnedDate, pinnedNotes }
}

export function recomputeQueue(input: QueueInput): QueueResult {
  const { planStartDate, raceDate, today } = input
  const { templates, states } = prepare(input)
  const { occupied, pinnedDate, pinnedNotes } = buildOccupiedAndPins(templates, states, input.overrides, raceDate)

  // Everything else is placed by the search/escalation/shortfall algorithm.
  const openInstances: OpenInstance[] = templates
    .filter((t) => {
      const state = states.get(t.templateId)
      return state !== undefined && !EVENT_TERMINAL_STATUSES.includes(state.status) && !pinnedDate.has(t.templateId)
    })
    .map((t) => {
      const state = states.get(t.templateId)
      return {
        templateId: t.templateId,
        weekNumber: t.weekNumber,
        sequenceInWeek: t.sequenceInWeek,
        priority: t.priority,
        recoveryTags: [...t.recoveryTags],
        name: t.name,
        plannedDate: plannedDateFor(t, planStartDate),
        deferralRequested: state?.deferralRequested ?? false,
      }
    })

  const placements = placeOpenInstances(openInstances, occupied, today, raceDate, planStartDate)

  const instances: ScheduledInstance[] = []
  const explanations: QueueResult['explanations'] = []
  const dropped: QueueResult['dropped'] = []

  for (const t of templates) {
    const state = states.get(t.templateId)
    if (state === undefined) continue
    const plannedDate = plannedDateFor(t, planStartDate)
    const base = {
      templateId: t.templateId, weekNumber: t.weekNumber, sessionSlot: t.sessionSlot, sequence: t.sequenceInWeek,
      name: t.name, priority: t.priority, recoveryTags: [...t.recoveryTags], plannedDate,
    }

    if (EVENT_TERMINAL_STATUSES.includes(state.status)) {
      const scheduledDate = state.status === 'skipped' ? null : state.completedForDate
      instances.push({
        ...base, scheduledDate, status: state.status, completedForDate: state.completedForDate,
        isManualOverride: state.isManualOverride, adjustmentReason: null, softConflicts: [],
      })
      continue
    }

    if (pinnedDate.has(t.templateId)) {
      const scheduledDate = pinnedDate.get(t.templateId) ?? null
      instances.push({
        ...base, scheduledDate, status: state.status === 'deferred' ? 'upcoming' : state.status,
        completedForDate: null, isManualOverride: true, adjustmentReason: null,
        softConflicts: pinnedNotes.get(t.templateId) ?? [],
      })
      continue
    }

    const placement = placements.get(t.templateId)
    const isDropped = (placement?.dropped ?? null) !== null
    instances.push({
      ...base,
      scheduledDate: placement?.scheduledDate ?? null,
      status: isDropped ? 'autoDropped' : state.status,
      completedForDate: null,
      isManualOverride: state.isManualOverride,
      adjustmentReason: placement?.explanation ?? null,
      softConflicts: [],
    })
    if (placement?.explanation !== null && placement?.explanation !== undefined) {
      explanations.push({ templateId: t.templateId, weekNumber: t.weekNumber, text: placement.explanation })
    }
    if (placement?.dropped) dropped.push(placement.dropped)
  }

  instances.sort((a, b) => a.weekNumber - b.weekNumber || a.sequence - b.sequence)
  return { instances, explanations, dropped }
}
