import type { ISODate, Priority, RecoveryTag, ScheduleEvent, ScheduleOverride, WorkoutStatus } from '@/domain/types'
import { addDays } from '@/domain/dates'
import type { OccupiedDay } from './eligibility'
import { isDayEligible } from './eligibility'
import type { OpenInstance } from './placement'
import { placeOpenInstances } from './placement'
import { DAYS_PER_WEEK, SLOT_DAY_OFFSET } from './constants'
import { activePin, pinSoftConflicts } from './pins'
import { joinSentences, pinNotHonoredExplanation } from './explain'
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
 * moves bypass hard conflicts but record every violated rule (`pins.ts`).
 *
 * A pin whose target date is already occupied — by a frozen instance, or by
 * a higher-precedence pin — is never honoured onto that day: double-booking
 * is not something a manual override can meaningfully ask for (only
 * *recovery* conflicts are overridable). When two active pins collide on
 * the same date, the more recently created one wins (mirroring `activePin`'s
 * own per-template tie-break), with override `id` breaking a tie on
 * `createdAt` so the outcome never depends on `overrides` array order. The
 * losing pin is not silently dropped — its template falls through to normal
 * automated placement, and `rejectedPinReasons` carries the explanation. */
function buildOccupiedAndPins(
  templates: QueueTemplate[],
  states: Map<string, InstanceState>,
  overrides: ScheduleOverride[],
  raceDate: ISODate,
) {
  const occupied: OccupiedDay[] = []
  const pinnedDate = new Map<string, ISODate>()
  const pinnedNotes = new Map<string, string[]>()
  const rejectedPinReasons = new Map<string, string>()

  for (const t of templates) {
    const state = states.get(t.templateId)
    if (state === undefined || !EVENT_TERMINAL_STATUSES.includes(state.status)) continue
    const scheduledDate = state.status === 'skipped' ? null : state.completedForDate
    if (scheduledDate !== null) {
      occupied.push({
        date: scheduledDate, tags: [...t.recoveryTags],
        ...(state.completedViaBackdate ? { backdatedName: t.name } : {}),
      })
    }
  }

  interface PinCandidate { template: QueueTemplate; pin: ScheduleOverride }
  const pinCandidates: PinCandidate[] = []
  for (const t of templates) {
    const state = states.get(t.templateId)
    if (state === undefined || EVENT_TERMINAL_STATUSES.includes(state.status)) continue
    const pin = activePin(overrides, t.templateId)
    if (pin === null) continue
    pinCandidates.push({ template: t, pin })
  }

  // Precedence order when two pins target the same date: most recently
  // created wins; `id` breaks a `createdAt` tie. Processing in this order
  // (rather than templates order) is what makes the outcome independent of
  // both `templates` and `overrides` array order.
  pinCandidates.sort((a, b) => {
    if (a.pin.createdAt !== b.pin.createdAt) return a.pin.createdAt < b.pin.createdAt ? 1 : -1
    if (a.pin.id === b.pin.id) return 0
    return a.pin.id < b.pin.id ? 1 : -1
  })

  for (const { template: t, pin } of pinCandidates) {
    if (occupied.some((o) => o.date === pin.date)) {
      rejectedPinReasons.set(t.templateId, pinNotHonoredExplanation(t.name))
      continue
    }
    const evaluation = isDayEligible({ candidate: pin.date, candidateTags: t.recoveryTags, occupied, raceDate })
    pinnedNotes.set(t.templateId, pinSoftConflicts(evaluation))
    pinnedDate.set(t.templateId, pin.date)
    occupied.push({ date: pin.date, tags: [...t.recoveryTags] })
  }

  return { occupied, pinnedDate, pinnedNotes, rejectedPinReasons }
}

export function recomputeQueue(input: QueueInput): QueueResult {
  const { planStartDate, raceDate, today } = input
  const { templates, states } = prepare(input)
  const { occupied, pinnedDate, pinnedNotes, rejectedPinReasons } = buildOccupiedAndPins(templates, states, input.overrides, raceDate)

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
    // A rejected pin (its target date was already occupied) falls through to
    // this automated-placement branch — prepend its own explanation to
    // whatever the placement search separately produced, so the athlete
    // learns both why the pin didn't stick and where the session landed
    // instead (see `buildOccupiedAndPins`).
    const rejectedPinReason = rejectedPinReasons.get(t.templateId) ?? null
    const adjustmentReason = rejectedPinReason !== null
      ? (placement?.explanation !== null && placement?.explanation !== undefined
        ? joinSentences(rejectedPinReason, placement.explanation)
        : rejectedPinReason)
      : (placement?.explanation ?? null)
    instances.push({
      ...base,
      scheduledDate: placement?.scheduledDate ?? null,
      status: isDropped ? 'autoDropped' : state.status,
      completedForDate: null,
      // A rejected pin never took effect — its template fell through to
      // ordinary automated placement — so `isManualOverride` must not report
      // `true` here even though `state.isManualOverride` is set unconditionally
      // by any MOVE event in the history. Only `rejectedPinReason === null`
      // (no rejection recorded for this instance) lets the event-derived flag
      // through; a rejected pin always reports `false`, matching what the
      // schedule actually reflects.
      isManualOverride: rejectedPinReason === null && state.isManualOverride,
      adjustmentReason,
      softConflicts: [],
    })
    if (adjustmentReason !== null) {
      explanations.push({ templateId: t.templateId, weekNumber: t.weekNumber, text: adjustmentReason })
    }
    if (placement?.dropped) dropped.push(placement.dropped)
  }

  instances.sort((a, b) => a.weekNumber - b.weekNumber || a.sequence - b.sequence)
  return { instances, explanations, dropped }
}
