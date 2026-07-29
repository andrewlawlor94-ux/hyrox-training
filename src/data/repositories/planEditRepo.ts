// Task 27 (§14): editing an upcoming workout -- add/delete/duplicate/reorder
// sessions within a plan week -- and changing an active plan's duration.
// Exercise-within-a-session editing lives in the sibling `exerciseEditRepo.ts`
// (kept separate so both files stay under the ~250-line guideline).
import { db } from '@/data/db'
import type {
  ISODate, InstancePrescription, Plan, Prescription, Priority, WorkoutInstance, WorkoutKind, WorkoutTemplate,
} from '@/data/types'
import { addDays } from '@/domain/dates'
import { DAYS_PER_WEEK, SLOT_DAY_OFFSET } from '@/domain/queue/constants'
import { assertMutable } from './guard'
import { newId } from './ids'
import { BASE_PHASE_NAME, materializePlan, pruneHistorylessPlanData } from './planMaterialize'
import { syncQueue } from './scheduleRepo'
import { getSettings } from './settingsRepo'

/** `sessionSlot` is 1-6 (Monday-Saturday); Sunday is structurally reserved
 * as the plan's free day (see `SLOT_DAY_OFFSET`'s own doc comment) so it is
 * never a candidate slot for a newly added or duplicated session. */
const MAX_SESSION_SLOTS = 6

export function plannedDateFor(weekNumber: number, sessionSlot: number, planStartDate: ISODate): ISODate {
  const offset = SLOT_DAY_OFFSET[sessionSlot] ?? 0
  return addDays(planStartDate, (weekNumber - 1) * DAYS_PER_WEEK + offset)
}

function firstFreeSlot(usedSlots: ReadonlySet<number>): number {
  for (let slot = 1; slot <= MAX_SESSION_SLOTS; slot += 1) {
    if (!usedSlots.has(slot)) return slot
  }
  throw new Error('This week already has the maximum of 6 sessions.')
}

export interface AddWorkoutInput {
  planId: string
  weekNumber: number
  name: string
  kind: WorkoutKind
  priority: Priority
  estMinutes: number
}

/** Adds a brand-new session to an existing plan week, in the first free
 * Monday-Saturday slot. Caller must follow with `syncQueue` so the new
 * instance's `scheduledDate`/`status` reconcile against the rest of the
 * schedule. */
export async function addWorkoutToWeek(input: AddWorkoutInput): Promise<WorkoutInstance> {
  return db.transaction('rw', db.tables, async () => {
    const plan = await db.plans.get(input.planId)
    if (!plan) throw new Error(`No Plan "${input.planId}"`)
    const weeks = await db.planWeeks.where('planId').equals(input.planId).toArray()
    const planWeek = weeks.find((w) => w.weekNumber === input.weekNumber)
    if (!planWeek) throw new Error(`No PlanWeek "${String(input.weekNumber)}" in plan "${input.planId}"`)

    const existingTemplates = await db.workoutTemplates.where('planWeekId').equals(planWeek.id).toArray()
    const freeSlot = firstFreeSlot(new Set(existingTemplates.map((t) => t.sessionSlot)))

    const templateId = newId('tmpl')
    const template: WorkoutTemplate = {
      id: templateId, planId: input.planId, planWeekId: planWeek.id, sessionSlot: freeSlot,
      sequenceInWeek: existingTemplates.length, name: input.name, kind: input.kind, priority: input.priority,
      recoveryTags: [], estMinutes: input.estMinutes, notes: '',
    }
    await db.workoutTemplates.add(template)

    const plannedDate = plannedDateFor(input.weekNumber, freeSlot, plan.startDate)
    const instance: WorkoutInstance = {
      id: newId('wi'), planId: input.planId, templateId, weekNumber: input.weekNumber, sessionSlot: freeSlot,
      plannedDate, scheduledDate: plannedDate, sequence: template.sequenceInWeek, priority: input.priority,
      recoveryTags: [], status: 'upcoming', isManualOverride: false, frozen: false,
    }
    await db.workoutInstances.add(instance)
    return instance
  })
}

/**
 * Deletes an upcoming (non-frozen) session outright: its `WorkoutInstance`,
 * its own `WorkoutTemplate`/`Prescription` rows (never shared with any other
 * instance — each week's session is materialized as its own template row),
 * and any logged child rows it happens to carry (an `inProgress` session can
 * have partial logs despite not being frozen yet). Guarded like every other
 * instance write: throws on a frozen (completed/partially-completed) instance.
 */
export async function deleteWorkout(instanceId: string): Promise<void> {
  return db.transaction('rw', db.tables, async () => {
    const instance = await db.workoutInstances.get(instanceId)
    if (!instance) return
    assertMutable(instance)

    const runLogIds = (await db.runLogs.where('instanceId').equals(instanceId).toArray()).map((r) => r.id)
    if (runLogIds.length > 0) await db.intervalSplits.where('runLogId').anyOf(runLogIds).delete()
    await db.runLogs.where('instanceId').equals(instanceId).delete()
    await db.stationLogs.where('instanceId').equals(instanceId).delete()
    await db.strengthSets.where('instanceId').equals(instanceId).delete()
    await db.symptomLogs.where('instanceId').equals(instanceId).delete()
    await db.instancePrescriptions.where('instanceId').equals(instanceId).delete()
    await db.workoutInstances.delete(instanceId)
    await db.prescriptions.where('templateId').equals(instance.templateId).delete()
    await db.workoutTemplates.delete(instance.templateId)
  })
}

function omitProvenance(p: InstancePrescription): Omit<Prescription, 'id' | 'templateId'> {
  const rest: Partial<InstancePrescription> = { ...p }
  delete rest.id
  delete rest.instanceId
  delete rest.templateId
  delete rest.sourcePrescriptionId
  return rest as Omit<Prescription, 'id' | 'templateId'>
}

/**
 * Clones a session into the first free slot of the SAME week: a new
 * `WorkoutTemplate` + `Prescription` rows copied from the source instance's
 * CURRENT `InstancePrescription`s (what's actually configured for this
 * occurrence right now, not whatever the original template still says), and
 * a new upcoming `WorkoutInstance`. The source is left untouched regardless
 * of whether it is frozen — duplicating never mutates what it copies from.
 */
export async function duplicateWorkout(instanceId: string): Promise<WorkoutInstance> {
  return db.transaction('rw', db.tables, async () => {
    const source = await db.workoutInstances.get(instanceId)
    if (!source) throw new Error(`No WorkoutInstance "${instanceId}"`)
    const sourceTemplate = await db.workoutTemplates.get(source.templateId)
    if (!sourceTemplate) throw new Error(`No WorkoutTemplate "${source.templateId}"`)
    const plan = await db.plans.get(source.planId)
    if (!plan) throw new Error(`No Plan "${source.planId}"`)

    const weekTemplates = await db.workoutTemplates.where('planWeekId').equals(sourceTemplate.planWeekId).toArray()
    const freeSlot = firstFreeSlot(new Set(weekTemplates.map((t) => t.sessionSlot)))

    const newTemplateId = newId('tmpl')
    const newTemplate: WorkoutTemplate = {
      ...sourceTemplate, id: newTemplateId, sessionSlot: freeSlot, sequenceInWeek: weekTemplates.length,
      name: `${sourceTemplate.name} (copy)`,
    }
    await db.workoutTemplates.add(newTemplate)

    const sourcePrescriptions = await db.instancePrescriptions.where('instanceId').equals(instanceId).sortBy('order')
    const newPrescriptions: Prescription[] = sourcePrescriptions.map((p) => ({
      ...omitProvenance(p), id: newId('rx'), templateId: newTemplateId,
    }))
    if (newPrescriptions.length > 0) await db.prescriptions.bulkAdd(newPrescriptions)

    const plannedDate = plannedDateFor(source.weekNumber, freeSlot, plan.startDate)
    const newInstance: WorkoutInstance = {
      id: newId('wi'), planId: source.planId, templateId: newTemplateId, weekNumber: source.weekNumber,
      sessionSlot: freeSlot, plannedDate, scheduledDate: plannedDate, sequence: newTemplate.sequenceInWeek,
      priority: source.priority, recoveryTags: [...source.recoveryTags], status: 'upcoming',
      isManualOverride: false, frozen: false,
    }
    await db.workoutInstances.add(newInstance)

    if (newPrescriptions.length > 0) {
      const newInstancePrescriptions: InstancePrescription[] = newPrescriptions.map((p) => ({
        ...p, id: newId('ip'), instanceId: newInstance.id, sourcePrescriptionId: p.id,
      }))
      await db.instancePrescriptions.bulkAdd(newInstancePrescriptions)
    }

    return newInstance
  })
}

/**
 * Move-up/move-down reordering, one adjacent swap at a time (keyboard
 * reachable — no drag required): swaps `sessionSlot`/`sequenceInWeek`
 * between two sessions in the same week, recomputing each one's
 * `plannedDate`/`scheduledDate` from its NEW slot. Both instances must be
 * non-frozen — swapping a completed session's date would rewrite history.
 * Caller should follow with `syncQueue` to reconcile the rest of the
 * schedule against the new slot assignment.
 */
export async function swapWorkoutOrder(instanceIdA: string, instanceIdB: string): Promise<void> {
  return db.transaction('rw', db.tables, async () => {
    const [instA, instB] = await Promise.all([db.workoutInstances.get(instanceIdA), db.workoutInstances.get(instanceIdB)])
    if (!instA || !instB) throw new Error('Both workouts must exist to reorder them')
    assertMutable(instA)
    assertMutable(instB)
    const [tmplA, tmplB] = await Promise.all([db.workoutTemplates.get(instA.templateId), db.workoutTemplates.get(instB.templateId)])
    if (!tmplA || !tmplB) throw new Error('Both workout templates must exist to reorder them')
    const plan = await db.plans.get(instA.planId)
    if (!plan) throw new Error(`No Plan "${instA.planId}"`)

    await db.workoutTemplates.put({ ...tmplA, sessionSlot: tmplB.sessionSlot, sequenceInWeek: tmplB.sequenceInWeek })
    await db.workoutTemplates.put({ ...tmplB, sessionSlot: tmplA.sessionSlot, sequenceInWeek: tmplA.sequenceInWeek })

    const dateForA = plannedDateFor(instA.weekNumber, tmplB.sessionSlot, plan.startDate)
    const dateForB = plannedDateFor(instB.weekNumber, tmplA.sessionSlot, plan.startDate)
    await db.workoutInstances.put({
      ...instA, sessionSlot: tmplB.sessionSlot, plannedDate: dateForA, scheduledDate: dateForA, sequence: tmplB.sequenceInWeek,
    })
    await db.workoutInstances.put({
      ...instB, sessionSlot: tmplA.sessionSlot, plannedDate: dateForB, scheduledDate: dateForB, sequence: tmplA.sequenceInWeek,
    })
  })
}

/**
 * Changes the active plan's core-weeks duration while every history-bearing
 * instance survives untouched (`pruneHistorylessPlanData`). `baseWeeksCount`
 * (the "Prologue" weeks) is held fixed — this operation only changes the
 * CORE (race-specific) week count, matching `anchorPlan`'s own
 * `coreWeeks`/`baseWeeks` split. The plan's `startDate` is never touched.
 */
export async function changePlanDuration(args: { coreWeeksCount: number; today: ISODate }): Promise<Plan> {
  const plan = await db.transaction('rw', db.tables, async () => {
    const settings = await getSettings()
    const activePlan = await db.plans.get(settings.activePlanId)
    if (!activePlan) throw new Error('No active plan')

    const oldWeeks = await db.planWeeks.where('planId').equals(activePlan.id).toArray()
    const oldPhases = await db.planPhases.where('planId').equals(activePlan.id).toArray()
    const phaseNameById = new Map(oldPhases.map((p) => [p.id, p.name]))
    const baseWeeksCount = oldWeeks.filter((w) => phaseNameById.get(w.phaseId) === BASE_PHASE_NAME).length

    const { existingPlanWeeks, skipSlots } = await pruneHistorylessPlanData(activePlan.id)

    await materializePlan({
      planId: activePlan.id, planStartDate: activePlan.startDate,
      baseWeeksCount, coreWeeksCount: args.coreWeeksCount, existingPlanWeeks, skipSlots,
    })

    const updatedPlan: Plan = { ...activePlan, weeksCount: baseWeeksCount + args.coreWeeksCount }
    await db.plans.put(updatedPlan)
    return updatedPlan
  })

  await syncQueue(args.today)
  return plan
}
