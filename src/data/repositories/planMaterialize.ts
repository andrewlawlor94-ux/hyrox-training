// Shared "turn seed/generated week data into database rows" logic used by
// both `installSeedPlan` (nothing to preserve) and
// `restoreSeedPlanPreservingHistory` (skip whatever already has history).
// Kept out of planRepo.ts to keep that file under the ~250 line guideline.
import { db } from '@/data/db'
import type {
  ISODate, PlanPhase, PlanWeek, Prescription, WorkoutInstance, WorkoutKind, WorkoutTemplate,
} from '@/data/types'
import { addDays } from '@/domain/dates'
import { DAYS_PER_WEEK, SLOT_DAY_OFFSET } from '@/domain/queue/constants'
import { generateBaseWeeks } from '@/domain/planGeneration/baseWeeks'
import { SEED_WEEKS_24, phaseForWeek } from '@/data/seed/plan24Week'
import { buildBaseWeekPrescriptions } from '@/data/seed/baseWeeks'
import { newId } from './ids'

/** Base weeks don't carry a `WorkoutKind` of their own (they're plain
 * placeholder sessions the athlete edits during onboarding); this mirrors
 * `BASE_SESSION_SPECS`' fixed five-slot order in `@/domain/planGeneration/baseWeeks`. */
const BASE_KIND_BY_SLOT: Record<number, WorkoutKind> = { 1: 'strength', 2: 'run', 3: 'zone2', 4: 'strength', 5: 'run' }
const BASE_PHASE_NAME = 'Prologue'

function plannedDateFor(weekNumber: number, sessionSlot: number, planStartDate: ISODate): ISODate {
  const offset = SLOT_DAY_OFFSET[sessionSlot] ?? 0
  return addDays(planStartDate, (weekNumber - 1) * DAYS_PER_WEEK + offset)
}

export interface MaterializeArgs {
  planId: string
  planStartDate: ISODate
  baseWeeksCount: number
  /** Weeks that already exist in the database (from a prior install) and
   * must be reused rather than duplicated — keyed by the FINAL (offset)
   * week number. */
  existingPlanWeeks?: Map<number, PlanWeek>
  /** `weekNumber:sessionSlot` pairs that already have a history-bearing
   * instance and must not be regenerated. */
  skipSlots?: ReadonlySet<string>
}

/** Materializes one week's sessions (templates + prescriptions + instances)
 * for either a generated Base week or a core `SEED_WEEKS_24` week, given its
 * FINAL week number (already offset by any Base-week prologue). */
async function materializeWeek(args: {
  planId: string
  planStartDate: ISODate
  finalWeekNumber: number
  isDeload: boolean
  label: string
  notes?: string
  phaseName: string
  phaseFocus: string
  phaseRange: { start: number; end: number }
  sessions: {
    sessionSlot: number; sequenceInWeek: number; name: string; kind: WorkoutKind
    priority: WorkoutTemplate['priority']; recoveryTags: WorkoutTemplate['recoveryTags']; estMinutes: number
    prescriptions: Omit<Prescription, 'id' | 'templateId'>[]
  }[]
  existingPlanWeeks: Map<number, PlanWeek>
  phaseCache: Map<string, PlanPhase>
  skipSlots: ReadonlySet<string>
}): Promise<void> {
  const existing = args.existingPlanWeeks.get(args.finalWeekNumber)
  let planWeek: PlanWeek
  if (existing) {
    planWeek = existing
  } else {
    let phase = args.phaseCache.get(args.phaseName)
    if (!phase) {
      phase = {
        id: newId('phase'), planId: args.planId, name: args.phaseName,
        weekStart: args.phaseRange.start, weekEnd: args.phaseRange.end, focus: args.phaseFocus,
      }
      args.phaseCache.set(args.phaseName, phase)
      await db.planPhases.add(phase)
    }
    planWeek = {
      id: newId('week'), planId: args.planId, weekNumber: args.finalWeekNumber, phaseId: phase.id,
      label: args.label, isDeload: args.isDeload, notes: args.notes ?? '',
    }
    await db.planWeeks.add(planWeek)
  }

  for (const session of args.sessions) {
    const key = `${String(args.finalWeekNumber)}:${String(session.sessionSlot)}`
    if (args.skipSlots.has(key)) continue

    const templateId = newId('tmpl')
    const template: WorkoutTemplate = {
      id: templateId, planId: args.planId, planWeekId: planWeek.id, sessionSlot: session.sessionSlot,
      sequenceInWeek: session.sequenceInWeek, name: session.name, kind: session.kind, priority: session.priority,
      recoveryTags: session.recoveryTags, estMinutes: session.estMinutes, notes: '',
    }
    await db.workoutTemplates.add(template)

    const prescriptions: Prescription[] = session.prescriptions.map((p) => ({ ...p, id: newId('rx'), templateId }))
    if (prescriptions.length > 0) await db.prescriptions.bulkAdd(prescriptions)

    const plannedDate = plannedDateFor(args.finalWeekNumber, session.sessionSlot, args.planStartDate)
    const instance: WorkoutInstance = {
      id: newId('wi'), planId: args.planId, templateId, weekNumber: args.finalWeekNumber, sessionSlot: session.sessionSlot,
      plannedDate, scheduledDate: plannedDate, sequence: session.sequenceInWeek, priority: session.priority,
      recoveryTags: session.recoveryTags, status: 'upcoming', isManualOverride: false, frozen: false,
    }
    await db.workoutInstances.add(instance)

    const instancePrescriptions = prescriptions.map((p) => ({ ...p, id: newId('ip'), instanceId: instance.id, sourcePrescriptionId: p.id }))
    if (instancePrescriptions.length > 0) await db.instancePrescriptions.bulkAdd(instancePrescriptions)
  }
}

export async function materializePlan(args: MaterializeArgs): Promise<void> {
  const existingPlanWeeks = args.existingPlanWeeks ?? new Map<number, PlanWeek>()
  const skipSlots = args.skipSlots ?? new Set<string>()
  const phaseCache = new Map<string, PlanPhase>()

  const baseWeeks = generateBaseWeeks(args.baseWeeksCount)
  for (const week of baseWeeks) {
    await materializeWeek({
      planId: args.planId, planStartDate: args.planStartDate, finalWeekNumber: week.weekNumber,
      isDeload: week.isDeload, label: week.label, phaseName: BASE_PHASE_NAME,
      phaseFocus: 'Editable prologue weeks filling the gap ahead of the core plan.',
      phaseRange: { start: 1, end: args.baseWeeksCount },
      sessions: week.templates.map((t) => ({
        sessionSlot: t.sessionSlot, sequenceInWeek: t.sequenceInWeek, name: t.name,
        kind: BASE_KIND_BY_SLOT[t.sessionSlot] ?? 'recovery', priority: t.priority, recoveryTags: t.recoveryTags,
        estMinutes: t.estMinutes, prescriptions: buildBaseWeekPrescriptions(t),
      })),
      existingPlanWeeks, phaseCache, skipSlots,
    })
  }

  for (const week of SEED_WEEKS_24) {
    const finalWeekNumber = args.baseWeeksCount + week.weekNumber
    const phase = phaseForWeek(week.weekNumber)
    await materializeWeek({
      planId: args.planId, planStartDate: args.planStartDate, finalWeekNumber,
      isDeload: week.isDeload, label: week.label, ...(week.notes !== undefined ? { notes: week.notes } : {}),
      phaseName: phase.name, phaseFocus: phase.focus,
      phaseRange: { start: args.baseWeeksCount + phase.weekStart, end: args.baseWeeksCount + phase.weekEnd },
      sessions: week.templates.map((t) => ({
        sessionSlot: t.sessionSlot, sequenceInWeek: t.sequenceInWeek, name: t.name, kind: t.kind,
        priority: t.priority, recoveryTags: t.recoveryTags, estMinutes: t.estMinutes,
        prescriptions: t.prescriptions.map((p) => ({ ...p })),
      })),
      existingPlanWeeks, phaseCache, skipSlots,
    })
  }
}

