import { db } from '@/data/db'
import type { EditScope, Exercise, ISODate, ISOInstant, Plan, PlanWeek, Prescription } from '@/data/types'
import { anchorPlan } from '@/domain/planGeneration/anchor'
import { PLAN_WEEKS_DEFAULT } from '@/domain/planGeneration/constants'
import { assertMutable } from './guard'
import { getSettings, updateSettings } from './settingsRepo'
import { syncQueue } from './scheduleRepo'
import { materializePlan } from './planMaterialize'
import { newId } from './ids'

export async function listPlans(): Promise<Plan[]> {
  return db.plans.toArray()
}

/** Exactly one plan is ever `active`: every other plan (including the
 * previously active one) is flipped to `archived` in the same pass. */
export async function setActivePlan(planId: string): Promise<void> {
  const target = await db.plans.get(planId)
  if (!target) throw new Error(`No Plan "${planId}"`)
  const all = await db.plans.toArray()
  for (const p of all) {
    const nextStatus = p.id === planId ? 'active' : 'archived'
    if (p.status !== nextStatus) await db.plans.put({ ...p, status: nextStatus })
  }
  await updateSettings({ activePlanId: planId })
}

export async function archivePlan(planId: string): Promise<void> {
  const plan = await db.plans.get(planId)
  if (!plan) throw new Error(`No Plan "${planId}"`)
  await db.plans.put({ ...plan, status: 'archived' })
}

/**
 * Anchors a fresh plan to `raceDate` (via `anchorPlan`), materializes every
 * Base + core-week template/prescription/instance row, and makes it active.
 * `installSeedPlan`'s signature (per the brief) carries no `targetSeconds`/
 * `stretchSeconds`/`division`, so it creates a placeholder `RaceGoal` (0/0,
 * no division) when no active goal already targets this race date — the
 * athlete fills in real numbers later via `goalRepo.setRaceGoal`, which does
 * not need to touch `Plan.raceGoalId` back (see `syncQueue`, which always
 * prefers the current *active* goal over the plan's own `raceGoalId`).
 */
export async function installSeedPlan(args: { today: ISODate; raceDate: ISODate; now: ISOInstant }): Promise<Plan> {
  const plan = await db.transaction('rw', db.tables, async () => {
    const anchor = anchorPlan({ today: args.today, raceDate: args.raceDate })

    let goal = await db.raceGoals.filter((g) => g.isActive).first()
    if (!goal || goal.raceDate !== args.raceDate) {
      const division = goal?.division ?? ''
      if (goal) await db.raceGoals.put({ ...goal, isActive: false })
      goal = {
        id: newId('goal'), raceDate: args.raceDate, targetSeconds: 0, stretchSeconds: 0,
        division, isActive: true, createdAt: args.now,
      }
      await db.raceGoals.add(goal)
    }

    const newPlan: Plan = {
      id: newId('plan'), name: 'Main plan', weeksCount: anchor.totalWeeks, status: 'active',
      startDate: anchor.planStartDate, raceGoalId: goal.id, createdAt: args.now,
    }
    await db.plans.add(newPlan)

    await materializePlan({
      planId: newPlan.id, planStartDate: anchor.planStartDate,
      baseWeeksCount: anchor.baseWeeks, coreWeeksCount: anchor.coreWeeks,
    })

    const others = await db.plans.where('status').equals('active').toArray()
    for (const p of others) {
      if (p.id !== newPlan.id) await db.plans.put({ ...p, status: 'archived' })
    }
    await updateSettings({ activePlanId: newPlan.id })

    return newPlan
  })

  await syncQueue(args.today)
  return plan
}

/**
 * Copies a plan's definition (phases, weeks, templates, prescriptions) under
 * fresh ids so later edits to either copy never affect the other. Deliberately
 * does not materialize instances — the copy is a draft until `setActivePlan`
 * promotes it, at which point a future task can (re)install it.
 */
export async function duplicatePlan(planId: string, name: string, now: ISOInstant): Promise<Plan> {
  return db.transaction('rw', db.tables, async () => {
    const source = await db.plans.get(planId)
    if (!source) throw new Error(`No Plan "${planId}"`)
    const newPlanId = newId('plan')

    const phases = await db.planPhases.where('planId').equals(planId).toArray()
    const phaseIdMap = new Map(phases.map((p) => [p.id, newId('phase')]))
    await db.planPhases.bulkAdd(phases.map((p) => ({ ...p, id: phaseIdMap.get(p.id) ?? p.id, planId: newPlanId })))

    const weeks = await db.planWeeks.where('planId').equals(planId).toArray()
    const weekIdMap = new Map(weeks.map((w) => [w.id, newId('week')]))
    await db.planWeeks.bulkAdd(weeks.map((w) => ({
      ...w, id: weekIdMap.get(w.id) ?? w.id, planId: newPlanId, phaseId: phaseIdMap.get(w.phaseId) ?? w.phaseId,
    })))

    const templates = await db.workoutTemplates.where('planId').equals(planId).toArray()
    const templateIdMap = new Map(templates.map((t) => [t.id, newId('tmpl')]))
    await db.workoutTemplates.bulkAdd(templates.map((t) => ({
      ...t, id: templateIdMap.get(t.id) ?? t.id, planId: newPlanId, planWeekId: weekIdMap.get(t.planWeekId) ?? t.planWeekId,
    })))

    const templateIds = templates.map((t) => t.id)
    const prescriptions = templateIds.length > 0 ? await db.prescriptions.where('templateId').anyOf(templateIds).toArray() : []
    await db.prescriptions.bulkAdd(prescriptions.map((p) => ({ ...p, id: newId('rx'), templateId: templateIdMap.get(p.templateId) ?? p.templateId })))

    const newPlan: Plan = {
      id: newPlanId, name, weeksCount: source.weeksCount, status: 'archived', sourcePlanId: planId,
      startDate: source.startDate, raceGoalId: source.raceGoalId, createdAt: now,
    }
    await db.plans.add(newPlan)
    return newPlan
  })
}

/**
 * Regenerates the active plan's templates and future instances from the seed
 * data while every completed instance and every log row survives untouched.
 * "History" is any instance that is frozen OR has at least one child log row
 * (a set/run/station/symptom log referencing it) — not just frozen ones —
 * so an in-progress instance with already-logged sets is never discarded
 * out from under its own logs. History-bearing instances keep their
 * original `WorkoutTemplate`/`Prescription`/`PlanWeek` rows (so recomputeQueue
 * still sees their completion events' occupied days); everything else for
 * this plan is deleted and rebuilt from `SEED_WEEKS_24` using the plan's
 * existing `startDate` (unchanged — restoring does not re-anchor the plan).
 */
export async function restoreSeedPlanPreservingHistory(args: { today: ISODate; now: ISOInstant }): Promise<Plan> {
  const plan = await db.transaction('rw', db.tables, async () => {
    const settings = await getSettings()
    const activePlan = await db.plans.get(settings.activePlanId)
    if (!activePlan) throw new Error('No active plan to restore')

    const allInstances = await db.workoutInstances.where('planId').equals(activePlan.id).toArray()
    const keepInstances: typeof allInstances = []
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
    const oldTemplates = await db.workoutTemplates.where('planId').equals(activePlan.id).toArray()
    const templateIdsToDelete = oldTemplates.filter((t) => !keptTemplateIds.has(t.id)).map((t) => t.id)
    await db.workoutTemplates.bulkDelete(templateIdsToDelete)
    await db.prescriptions.where('templateId').anyOf(templateIdsToDelete).delete()

    const keptPlanWeekIds = new Set(oldTemplates.filter((t) => keptTemplateIds.has(t.id)).map((t) => t.planWeekId))
    const oldPlanWeeks = await db.planWeeks.where('planId').equals(activePlan.id).toArray()
    const oldPhases = await db.planPhases.where('planId').equals(activePlan.id).toArray()

    // Re-derive the base/core split from the active race goal, which is the
    // authoritative statement of how long this plan should be. The previous
    // `weeksCount - PLAN_WEEKS_DEFAULT` silently assumed every plan is
    // `baseWeeks + 24`, which is false for a compressed plan (race closer than
    // 24 weeks out): it clamped base weeks to zero and then regenerated all 24
    // core weeks, re-introducing sessions dated after race day.
    //
    // With no active goal there is nothing to anchor to, and the operation's
    // purpose is "restore the original plan" — so fall back to the full seed,
    // never to a truncated one.
    const goal = await db.raceGoals.filter((g) => g.isActive).first()
    const anchor = goal ? anchorPlan({ today: activePlan.startDate, raceDate: goal.raceDate }) : undefined
    const baseWeeksCount = anchor?.baseWeeks ?? 0
    const coreWeeksCount = anchor?.coreWeeks ?? PLAN_WEEKS_DEFAULT

    const existingPlanWeeks = new Map<number, PlanWeek>(oldPlanWeeks.filter((w) => keptPlanWeekIds.has(w.id)).map((w) => [w.weekNumber, w]))
    await db.planWeeks.bulkDelete(oldPlanWeeks.filter((w) => !keptPlanWeekIds.has(w.id)).map((w) => w.id))

    const keptPhaseIds = new Set([...existingPlanWeeks.values()].map((w) => w.phaseId))
    await db.planPhases.bulkDelete(oldPhases.filter((p) => !keptPhaseIds.has(p.id)).map((p) => p.id))

    const skipSlots = new Set(keepInstances.map((i) => `${String(i.weekNumber)}:${String(i.sessionSlot)}`))

    await materializePlan({
      planId: activePlan.id, planStartDate: activePlan.startDate,
      baseWeeksCount, coreWeeksCount, existingPlanWeeks, skipSlots,
    })

    return activePlan
  })

  await syncQueue(args.today)
  return plan
}

function mapPrescriptionPatchToExercise(patch: Partial<Prescription>): Partial<Exercise> {
  const mapped: Partial<Exercise> = {}
  if (patch.restSec !== undefined) mapped.defaultRestSec = patch.restSec
  if (patch.sets !== undefined) mapped.defaultSets = patch.sets
  if (patch.repMin !== undefined) mapped.repMin = patch.repMin
  if (patch.repMax !== undefined) mapped.repMax = patch.repMax
  if (patch.distanceM !== undefined) mapped.defaultDistanceM = patch.distanceM
  if (patch.durationSec !== undefined) mapped.defaultDurationSec = patch.durationSec
  return mapped
}

/**
 * The three edit scopes each touch exactly one thing:
 * - `thisWorkout`: only the given `InstancePrescription` (throws if its
 *   instance is frozen — there is no "skip" fallback for a single explicit
 *   target).
 * - `thisAndFuture`: the template `Prescription` this instance's snapshot
 *   was sourced from, plus every OTHER `InstancePrescription` in the same
 *   plan for the same exercise whose owning instance is not frozen. Frozen
 *   owners are silently skipped, never thrown on — "leaves them untouched"
 *   is the contract, not an error.
 * - `exerciseDefaultOnly`: only the `Exercise` row's overlapping default
 *   fields (rest, sets, rep range, distance, duration) — never a template or
 *   a scheduled instance.
 */
export async function applyPrescriptionEdit(args: {
  instanceId: string; prescriptionId: string; patch: Partial<Prescription>; scope: EditScope; now: ISOInstant
}): Promise<void> {
  const instance = await db.workoutInstances.get(args.instanceId)
  if (!instance) throw new Error(`No WorkoutInstance "${args.instanceId}"`)
  const instPrescription = await db.instancePrescriptions.get(args.prescriptionId)
  if (!instPrescription) throw new Error(`No InstancePrescription "${args.prescriptionId}"`)

  if (args.scope === 'thisWorkout') {
    assertMutable(instance)
    await db.instancePrescriptions.put({ ...instPrescription, ...args.patch })
    return
  }

  if (args.scope === 'exerciseDefaultOnly') {
    const exercise = await db.exercises.get(instPrescription.exerciseId)
    if (!exercise) throw new Error(`No Exercise "${instPrescription.exerciseId}"`)
    await db.exercises.put({ ...exercise, ...mapPrescriptionPatchToExercise(args.patch), updatedAt: args.now })
    return
  }

  if (instPrescription.sourcePrescriptionId) {
    const templatePrescription = await db.prescriptions.get(instPrescription.sourcePrescriptionId)
    if (templatePrescription) await db.prescriptions.put({ ...templatePrescription, ...args.patch })
  }

  const candidates = await db.instancePrescriptions.where('exerciseId').equals(instPrescription.exerciseId).toArray()
  for (const ip of candidates) {
    const owner = await db.workoutInstances.get(ip.instanceId)
    if (!owner || owner.planId !== instance.planId || owner.frozen) continue
    await db.instancePrescriptions.put({ ...ip, ...args.patch })
  }
}
