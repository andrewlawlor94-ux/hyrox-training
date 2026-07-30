import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { listSymptomLogs, readSettings, syncQueue } from '@/data/repositories'
import type { HyroxStandard, ISODate, Station, WorkoutInstance, WorkoutTemplate } from '@/data/types'
import { evaluateSymptoms } from '@/domain/symptoms/evaluate'
import type { SymptomState } from '@/domain/symptoms/evaluate'
import { evaluateMilestones } from '@/domain/milestones/evaluate'
import { goalTargets } from '@/domain/milestones/goalTargets'
import { computeTrajectory, estimateRaceRange } from '@/domain/milestones/trajectory'
import { buildMilestoneFacts, currentPlanWeek } from './homeFacts'
import { buildGoalSnapshotVM, buildThisWeekVM, buildTodaysWorkoutVM, structureLineFor } from './homeViewModel'
import type { HomeViewModel } from './types'

function symptomCautionText(symptomState: SymptomState): string | undefined {
  const reasons = [...symptomState.shin.reasons, ...symptomState.sciatic.reasons]
  return reasons.length > 0 ? reasons.join(' ') : undefined
}

async function structureLinesFor(instanceId: string): Promise<string[]> {
  const prescriptions = await db.instancePrescriptions.where('instanceId').equals(instanceId).sortBy('order')
  const lines: string[] = []
  for (const prescription of prescriptions) {
    const exercise = await db.exercises.get(prescription.exerciseId)
    if (exercise) lines.push(structureLineFor(exercise, prescription))
  }
  return lines
}

function buildPhaseLabelByWeek(
  planWeeks: { weekNumber: number; phaseId: string }[],
  phasesById: Map<string, { name: string }>,
): Map<number, string> {
  const map = new Map<number, string>()
  for (const week of planWeeks) {
    const phase = phasesById.get(week.phaseId)
    if (phase) map.set(week.weekNumber, phase.name)
  }
  return map
}

function buildStandardsByStation(standards: HyroxStandard[]): Map<Station, HyroxStandard> {
  return new Map(standards.map((s) => [s.station, s]))
}

/** Pure read (safe inside `useLiveQuery`): every call below only ever reads —
 * `readSettings`/`listSymptomLogs` are the pure repository reads, and every
 * other access goes straight through `db.<table>` the same way `useQueue`
 * does. Never calls `syncQueue` itself; see the `useEffect` below for why. */
async function loadHomeData(today: ISODate): Promise<HomeViewModel> {
  const noPlan: HomeViewModel = {
    hasPlan: false,
    today: {
      kind: 'noPlan', name: 'No plan installed', phaseLabel: '', structureLines: [],
      reason: 'Finish onboarding to install a training plan.',
      actions: { start: false, continue: false, completedEarlier: false, defer: false, skip: false, edit: false },
    },
    week: null,
    goal: null,
  }

  const settings = await readSettings()
  if (!settings.activePlanId) return noPlan
  const plan = await db.plans.get(settings.activePlanId)
  if (!plan) return noPlan
  const goal = (await db.raceGoals.filter((g) => g.isActive).first()) ?? (await db.raceGoals.get(plan.raceGoalId))
  if (!goal) return noPlan

  const [instances, templates, planWeeks, planPhases, runLogs, stationLogs, standards, explanations, symptomLogs] = await Promise.all([
    db.workoutInstances.where('planId').equals(plan.id).toArray(),
    db.workoutTemplates.where('planId').equals(plan.id).toArray(),
    db.planWeeks.where('planId').equals(plan.id).toArray(),
    db.planPhases.where('planId').equals(plan.id).toArray(),
    db.runLogs.toArray(),
    db.stationLogs.toArray(),
    db.hyroxStandards.toArray(),
    db.queueExplanations.toArray(),
    listSymptomLogs(),
  ])

  const templatesById = new Map(templates.map((t): [string, WorkoutTemplate] => [t.id, t]))
  const phasesById = new Map(planPhases.map((p): [string, { name: string }] => [p.id, { name: p.name }]))
  const phaseLabelByWeek = buildPhaseLabelByWeek(planWeeks, phasesById)
  const standardsByStation = buildStandardsByStation(standards)

  const explanationByInstanceId = new Map<string, string>()
  for (const e of explanations) {
    if (e.instanceId !== undefined && !explanationByInstanceId.has(e.instanceId)) explanationByInstanceId.set(e.instanceId, e.text)
  }

  const symptomState = evaluateSymptoms(symptomLogs, today)

  const todaysInstances = instances.filter((i: WorkoutInstance) => i.scheduledDate === today)
  const structureLinesByInstanceId = new Map<string, string[]>()
  for (const instance of todaysInstances) {
    structureLinesByInstanceId.set(instance.id, await structureLinesFor(instance.id))
  }

  const currentWeek = currentPlanWeek(plan.startDate, today, plan.weeksCount)
  const weekInstances = instances.filter((i) => i.weekNumber === currentWeek)
  const namesByInstanceId = new Map(instances.map((i): [string, string] => [i.id, templatesById.get(i.templateId)?.name ?? '']))

  const facts = buildMilestoneFacts({
    today, planStartDate: plan.startDate, totalWeeks: plan.weeksCount, instances, templatesById,
    runLogs, stationLogs, standardsByStation, symptomsFlagged: symptomState.anyFlag,
  })
  const targets = goalTargets(goal.targetSeconds)
  const milestones = evaluateMilestones(facts, targets)
  const trajectory = computeTrajectory(milestones, facts)
  const estimate = estimateRaceRange(facts, targets)

  return {
    hasPlan: true,
    today: buildTodaysWorkoutVM({
      today, instances, templatesById, phaseLabelByWeek, structureLinesByInstanceId, explanationByInstanceId,
      symptomCaution: symptomCautionText(symptomState),
    }),
    week: buildThisWeekVM({
      weekNumber: currentWeek, phaseLabel: phaseLabelByWeek.get(currentWeek) ?? '', weekInstances, namesByInstanceId,
    }),
    goal: buildGoalSnapshotVM({ today, raceDate: goal.raceDate, targetSeconds: goal.targetSeconds, facts, milestones, trajectory, estimate }),
  }
}

/**
 * The one clock read this hook trusts is its `today` argument — never the
 * ambient clock. Composes `syncQueue`, `evaluateSymptoms`,
 * `evaluateMilestones`, `computeTrajectory`, and `estimateRaceRange` into a
 * single view model so `HomeScreen`'s three cards stay presentational.
 *
 * `syncQueue` runs in a `useEffect`, deliberately OUTSIDE the live query —
 * same reasoning as `useWorkout`'s `startWorkout` effect: a write inside a
 * Dexie `useLiveQuery` callback throws. Without this, a day could roll over
 * with the athlete never opening a workout screen (the only other place
 * `syncQueue` is currently called from), leaving Home showing a stale queue.
 * `syncQueue` is idempotent (see its own doc comment), so re-running it on
 * every `today` change — including the first mount — is always safe.
 */
export function useHomeData(today: ISODate): HomeViewModel | undefined {
  const data = useLiveQuery(() => loadHomeData(today), [today])

  useEffect(() => {
    syncQueue(today).catch((err: unknown) => { console.error('Home syncQueue failed', err) })
  }, [today])

  return data
}
