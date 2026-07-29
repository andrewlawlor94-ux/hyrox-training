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
/** Phase name given to generated Base weeks. Exported because
 * `restoreSeedPlanPreservingHistory` counts stored Base weeks by phase name to
 * recover the base/core split without needing a race goal. */
export const BASE_PHASE_NAME = 'Prologue'

function plannedDateFor(weekNumber: number, sessionSlot: number, planStartDate: ISODate): ISODate {
  const offset = SLOT_DAY_OFFSET[sessionSlot] ?? 0
  return addDays(planStartDate, (weekNumber - 1) * DAYS_PER_WEEK + offset)
}

export interface MaterializeArgs {
  planId: string
  planStartDate: ISODate
  baseWeeksCount: number
  /**
   * How many of the 24 core seed weeks to materialize. `anchorPlan` compresses
   * this below `PLAN_WEEKS_DEFAULT` when the race is closer than 24 weeks out,
   * and materializing all 24 regardless would create sessions dated after race
   * day — the queue would correctly refuse to schedule them, leaving the plan
   * showing weeks that can never happen. Always pass `anchor.coreWeeks`.
   */
  coreWeeksCount: number
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
    stationVolumePct?: number
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
      ...(session.stationVolumePct !== undefined ? { stationVolumePct: session.stationVolumePct } : {}),
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

export interface PruneResult {
  /** Instances kept because they carry history (frozen, or a logged child
   * row) — keyed nowhere; callers only need the derived maps below. */
  keepInstances: WorkoutInstance[]
  /** Surviving `PlanWeek` rows keyed by their (still-final) week number, fed
   * straight into `materializePlan`'s `existingPlanWeeks` so a re-materialize
   * reuses rather than duplicates them. */
  existingPlanWeeks: Map<number, PlanWeek>
  /** `weekNumber:sessionSlot` pairs a re-materialize must not regenerate. */
  skipSlots: Set<string>
}

/**
 * Shared by `restoreSeedPlanPreservingHistory` and any other operation that
 * needs to regenerate an active plan's future content while every
 * history-bearing instance survives untouched: deletes every
 * `WorkoutInstance` (and its `InstancePrescription`s) that carries no
 * history, then deletes the now-orphaned `WorkoutTemplate`/`Prescription`/
 * `PlanWeek`/`PlanPhase` rows those discarded instances belonged to. "History"
 * is frozen OR has at least one child log row (set/run/station/symptom log),
 * matching `restoreSeedPlanPreservingHistory`'s own doc comment — an
 * in-progress instance with already-logged sets must never be discarded out
 * from under its own logs.
 *
 * Does NOT call `materializePlan` itself — callers derive their own
 * `baseWeeksCount`/`coreWeeksCount` (they differ: a full restore re-derives
 * both from the active race goal, a duration change holds `baseWeeksCount`
 * fixed and only changes `coreWeeksCount`) and pass this result's
 * `existingPlanWeeks`/`skipSlots` straight through.
 */
export async function pruneHistorylessPlanData(planId: string): Promise<PruneResult> {
  const allInstances = await db.workoutInstances.where('planId').equals(planId).toArray()
  const keepInstances: WorkoutInstance[] = []
  const discardIds: string[] = []
  for (const inst of allInstances) {
    const hasHistory = inst.frozen
      || (await db.strengthSets.where('instanceId').equals(inst.id).count()) > 0
      || (await db.runLogs.where('instanceId').equals(inst.id).count()) > 0
      || (await db.stationLogs.where('instanceId').equals(inst.id).count()) > 0
      || (await db.symptomLogs.where('instanceId').equals(inst.id).count()) > 0
    if (hasHistory) keepInstances.push(inst)
    else discardIds.push(inst.id)
  }

  await db.workoutInstances.bulkDelete(discardIds)
  await db.instancePrescriptions.where('instanceId').anyOf(discardIds).delete()

  const keptTemplateIds = new Set(keepInstances.map((i) => i.templateId))
  const oldTemplates = await db.workoutTemplates.where('planId').equals(planId).toArray()
  const templateIdsToDelete = oldTemplates.filter((t) => !keptTemplateIds.has(t.id)).map((t) => t.id)
  await db.workoutTemplates.bulkDelete(templateIdsToDelete)
  await db.prescriptions.where('templateId').anyOf(templateIdsToDelete).delete()

  const keptPlanWeekIds = new Set(oldTemplates.filter((t) => keptTemplateIds.has(t.id)).map((t) => t.planWeekId))
  const oldPlanWeeks = await db.planWeeks.where('planId').equals(planId).toArray()
  const oldPhases = await db.planPhases.where('planId').equals(planId).toArray()

  const existingPlanWeeks = new Map<number, PlanWeek>(oldPlanWeeks.filter((w) => keptPlanWeekIds.has(w.id)).map((w) => [w.weekNumber, w]))
  await db.planWeeks.bulkDelete(oldPlanWeeks.filter((w) => !keptPlanWeekIds.has(w.id)).map((w) => w.id))

  const keptPhaseIds = new Set([...existingPlanWeeks.values()].map((w) => w.phaseId))
  await db.planPhases.bulkDelete(oldPhases.filter((p) => !keptPhaseIds.has(p.id)).map((p) => p.id))

  const skipSlots = new Set(keepInstances.map((i) => `${String(i.weekNumber)}:${String(i.sessionSlot)}`))

  return { keepInstances, existingPlanWeeks, skipSlots }
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

  // A compressed plan keeps the LAST `coreWeeksCount` seed weeks, not the first.
  // The taper and race-specific work must survive: dropping from the end would
  // leave the athlete arriving at race day mid-Build with no taper at all,
  // whereas dropping from the front only costs early aerobic base volume.
  const survivingCoreWeeks = SEED_WEEKS_24
    .slice(Math.max(0, SEED_WEEKS_24.length - args.coreWeeksCount))
    .map((week, index) => ({ week, finalWeekNumber: args.baseWeeksCount + index + 1 }))

  // Phase ranges are derived from the weeks that actually survived, because a
  // compressed plan can truncate or drop a phase entirely and the seed's own
  // ranges would then point at weeks that do not exist.
  const phaseBounds = new Map<string, { start: number; end: number }>()
  for (const { week, finalWeekNumber } of survivingCoreWeeks) {
    const name = phaseForWeek(week.weekNumber).name
    const bounds = phaseBounds.get(name)
    if (bounds) bounds.end = finalWeekNumber
    else phaseBounds.set(name, { start: finalWeekNumber, end: finalWeekNumber })
  }

  for (const { week, finalWeekNumber } of survivingCoreWeeks) {
    const phase = phaseForWeek(week.weekNumber)
    const range = phaseBounds.get(phase.name) ?? { start: finalWeekNumber, end: finalWeekNumber }
    await materializeWeek({
      planId: args.planId, planStartDate: args.planStartDate, finalWeekNumber,
      isDeload: week.isDeload, label: week.label, ...(week.notes !== undefined ? { notes: week.notes } : {}),
      phaseName: phase.name, phaseFocus: phase.focus,
      phaseRange: { start: range.start, end: range.end },
      sessions: week.templates.map((t) => ({
        sessionSlot: t.sessionSlot, sequenceInWeek: t.sequenceInWeek, name: t.name, kind: t.kind,
        priority: t.priority, recoveryTags: t.recoveryTags, estMinutes: t.estMinutes,
        ...(t.stationVolumePct !== undefined ? { stationVolumePct: t.stationVolumePct } : {}),
        prescriptions: t.prescriptions.map((p) => ({ ...p })),
      })),
      existingPlanWeeks, phaseCache, skipSlots,
    })
  }
}

