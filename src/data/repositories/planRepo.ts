import { db } from '@/data/db'
import type { EditScope, Exercise, ISODate, ISOInstant, Plan, Prescription } from '@/data/types'
import { anchorPlan } from '@/domain/planGeneration/anchor'
import type { ReanchorDecision } from '@/domain/planGeneration/reanchor'
import { reanchorToRaceDate } from '@/domain/planGeneration/reanchor'
import { DEFAULT_STRETCH_SECONDS, DEFAULT_TARGET_SECONDS } from '@/domain/milestones/constants'
import { PLAN_WEEKS_DEFAULT } from '@/domain/planGeneration/constants'
import { assertMutable } from './guard'
import { getSettings, updateSettings } from './settingsRepo'
import { syncQueue } from './scheduleRepo'
import { BASE_PHASE_NAME, materializePlan, pruneHistorylessPlanData } from './planMaterialize'
import { changePlanDuration } from './planEditRepo'
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
 * `installSeedPlan`'s signature carries no `targetSeconds`/`stretchSeconds`/
 * `division`, so when no active goal already targets this race date it creates
 * one seeded with the shipped defaults (1:35 target / 1:30 stretch). The athlete
 * overwrites them via `goalRepo.setRaceGoal`, which does not need to touch
 * `Plan.raceGoalId` back (see `syncQueue`, which always prefers the current
 * *active* goal over the plan's own `raceGoalId`).
 */
export async function installSeedPlan(args: { today: ISODate; raceDate: ISODate; now: ISOInstant }): Promise<Plan> {
  const plan = await db.transaction('rw', db.tables, async () => {
    const anchor = anchorPlan({ today: args.today, raceDate: args.raceDate })

    let goal = await db.raceGoals.filter((g) => g.isActive).first()
    if (!goal || goal.raceDate !== args.raceDate) {
      const division = goal?.division ?? ''
      if (goal) await db.raceGoals.put({ ...goal, isActive: false })
      // Seeded with the shipped default goal, never 0/0: a zero-second target
      // is not "no goal set", it is a nonsense goal that flows straight into
      // `goalTargets` and yields meaningless pace milestones. The athlete
      // overwrites these during onboarding (or in Settings) via `setRaceGoal`.
      goal = {
        id: newId('goal'), raceDate: args.raceDate,
        targetSeconds: DEFAULT_TARGET_SECONDS, stretchSeconds: DEFAULT_STRETCH_SECONDS,
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

    const { existingPlanWeeks, skipSlots } = await pruneHistorylessPlanData(activePlan.id)

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

    await materializePlan({
      planId: activePlan.id, planStartDate: activePlan.startDate,
      baseWeeksCount, coreWeeksCount, existingPlanWeeks, skipSlots,
    })

    return activePlan
  })

  await syncQueue(args.today)
  return plan
}

/**
 * Re-establishes "the plan's final week is race week" after the athlete changes
 * their race date mid-plan (D1). `setRaceGoal` alone only appends the event and
 * swaps the goal row — `Plan.startDate` is what every session date is derived
 * from, so without this a postponed race left the whole plan (and its taper)
 * landing weeks early, and no amount of `syncQueue`ing moved it.
 *
 * All the judgement lives in the pure `reanchorToRaceDate`; this only persists
 * its decision. Completed history is untouched by construction: nothing here
 * writes to a `WorkoutInstance` at all, and the `syncQueue` that follows skips
 * every frozen row, so a completed session keeps its recorded dates while
 * upcoming ones re-derive from the new start.
 *
 * Returns the decision so the caller can show the athlete what happened.
 */
export async function reanchorActivePlanToRaceDate(args: { today: ISODate }): Promise<ReanchorDecision | null> {
  const prepared = await db.transaction('r', db.tables, async () => {
    const settings = await getSettings()
    const plan = await db.plans.get(settings.activePlanId)
    if (!plan) return null
    const goal = await db.raceGoals.filter((g) => g.isActive).first()
    if (!goal) return null

    // Base ("Prologue") weeks are counted from the plan's own phase rows rather
    // than assumed, because a plan can have anywhere from 0 to 8 of them.
    const weeks = await db.planWeeks.where('planId').equals(plan.id).toArray()
    const phases = await db.planPhases.where('planId').equals(plan.id).toArray()
    const phaseNameById = new Map(phases.map((phase) => [phase.id, phase.name]))
    const baseWeeks = weeks.filter((w) => phaseNameById.get(w.phaseId) === BASE_PHASE_NAME).length

    return {
      plan,
      decision: reanchorToRaceDate({
        currentStartDate: plan.startDate,
        baseWeeks,
        currentCoreWeeks: Math.max(1, plan.weeksCount - baseWeeks),
        raceDate: goal.raceDate,
      }),
    }
  })
  if (prepared === null) return null
  const { plan, decision } = prepared

  if (decision.outcome === 'startShiftedLater') {
    await db.plans.put({ ...plan, startDate: decision.startDate })
    await syncQueue(args.today)
    return decision
  }

  if (decision.outcome === 'compressed' || decision.outcome === 'extended') {
    // `changePlanDuration` re-materializes the history-less part of the plan at
    // the new length, keeps every completed session, and runs `syncQueue`
    // itself. Reused rather than reimplemented — it is the one tested path that
    // knows how to change a plan's length without touching history.
    await changePlanDuration({ coreWeeksCount: decision.coreWeeks, today: args.today })
    return decision
  }

  await syncQueue(args.today)
  return decision
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
