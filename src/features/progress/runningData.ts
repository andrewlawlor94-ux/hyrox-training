import { db } from '@/data/db'
import { listSymptomLogs, readSettings } from '@/data/repositories'
import type {
  Exercise, HyroxStandard, ISODate, InstancePrescription, RunLog, Station, WorkoutInstance, WorkoutTemplate,
} from '@/data/types'
import { evaluateSymptoms } from '@/domain/symptoms/evaluate'
import type { MilestoneFacts } from '@/domain/milestones/evaluate'
import { buildMilestoneFacts, currentPlanWeek } from '@/features/home/homeFacts'

export interface RunningRawData {
  today: ISODate
  totalWeeks: number
  currentWeek: number
  targetSeconds: number
  raceDate: ISODate
  instances: WorkoutInstance[]
  prescriptionsByInstanceId: Map<string, InstancePrescription[]>
  exercisesById: Map<string, Exercise>
  runLogs: RunLog[]
  facts: MilestoneFacts
}

function buildTemplatesById(templates: WorkoutTemplate[]): Map<string, WorkoutTemplate> {
  return new Map(templates.map((t): [string, WorkoutTemplate] => [t.id, t]))
}

function buildStandardsByStation(standards: HyroxStandard[]): Map<Station, HyroxStandard> {
  return new Map(standards.map((s) => [s.station, s]))
}

function groupByInstanceId(prescriptions: InstancePrescription[]): Map<string, InstancePrescription[]> {
  const map = new Map<string, InstancePrescription[]>()
  for (const p of prescriptions) {
    const list = map.get(p.instanceId) ?? []
    list.push(p)
    map.set(p.instanceId, list)
  }
  return map
}

/**
 * Everything `runningViewModel` needs, in one pure read (safe inside
 * `useLiveQuery`). Reuses Home's own `buildMilestoneFacts`/`currentPlanWeek`
 * (Task 24) rather than re-deriving milestone facts a second, possibly
 * inconsistent, way — see the Task 24 report for what those already cover.
 * Returns `null` when there is no active plan/goal at all (nothing to show
 * yet, not even an empty chart).
 */
export async function loadRunningRawData(today: ISODate): Promise<RunningRawData | null> {
  const settings = await readSettings()
  if (!settings.activePlanId) return null
  const plan = await db.plans.get(settings.activePlanId)
  if (!plan) return null
  const goal = (await db.raceGoals.filter((g) => g.isActive).first()) ?? (await db.raceGoals.get(plan.raceGoalId))
  if (!goal) return null

  const [instances, templates, runLogs, stationLogs, standards, symptomLogs, exercises] = await Promise.all([
    db.workoutInstances.where('planId').equals(plan.id).toArray(),
    db.workoutTemplates.where('planId').equals(plan.id).toArray(),
    db.runLogs.toArray(),
    db.stationLogs.toArray(),
    db.hyroxStandards.toArray(),
    listSymptomLogs(),
    db.exercises.toArray(),
  ])

  const instanceIds = instances.map((i) => i.id)
  const prescriptions = instanceIds.length > 0
    ? await db.instancePrescriptions.where('instanceId').anyOf(instanceIds).toArray()
    : []

  const templatesById = buildTemplatesById(templates)
  const symptomState = evaluateSymptoms(symptomLogs, today)

  const facts = buildMilestoneFacts({
    today,
    planStartDate: plan.startDate,
    totalWeeks: plan.weeksCount,
    instances,
    templatesById,
    runLogs,
    stationLogs,
    standardsByStation: buildStandardsByStation(standards),
    symptomsFlagged: symptomState.anyFlag,
  })

  return {
    today,
    totalWeeks: plan.weeksCount,
    currentWeek: currentPlanWeek(plan.startDate, today, plan.weeksCount),
    targetSeconds: goal.targetSeconds,
    raceDate: goal.raceDate,
    instances,
    prescriptionsByInstanceId: groupByInstanceId(prescriptions),
    exercisesById: new Map(exercises.map((e): [string, Exercise] => [e.id, e])),
    runLogs,
    facts,
  }
}
