// Pure (never-writes) reads for the Plan feature — safe inside `useLiveQuery`
// per this project's read-that-writes rule. Kept as one small module so
// `WeekList`/`WeekDetail`/`WorkoutEditor` share exactly one query shape.
import { db } from '@/data/db'
import { readSettings } from '@/data/repositories'
import type { Exercise, InstancePrescription, Priority, WorkoutInstance, WorkoutKind, WorkoutStatus } from '@/data/types'

export interface WeekSessionSummary {
  instanceId: string
  templateId: string
  name: string
  kind: WorkoutKind
  priority: Priority
  status: WorkoutStatus
  frozen: boolean
  sessionSlot: number
  scheduledDate: string
}

export interface WeekSummary {
  planWeekId: string
  weekNumber: number
  label: string
  phaseName: string
  isDeload: boolean
  sessions: WeekSessionSummary[]
}

export interface PlanOverview {
  planId: string
  planName: string
  weeks: WeekSummary[]
}

/** Every week of the active plan, each with its sessions (name/kind/
 * priority/status/frozen) in slot order — the one query `WeekList` and
 * `WeekDetail` both read from. Returns `undefined` when there is no active
 * plan yet (matches the rest of the app's "no plan installed" handling). */
export async function loadPlanOverview(): Promise<PlanOverview | undefined> {
  const settings = await readSettings()
  const plan = await db.plans.get(settings.activePlanId)
  if (!plan) return undefined

  const [weeks, phases, templates, instances] = await Promise.all([
    db.planWeeks.where('planId').equals(plan.id).toArray(),
    db.planPhases.where('planId').equals(plan.id).toArray(),
    db.workoutTemplates.where('planId').equals(plan.id).toArray(),
    db.workoutInstances.where('planId').equals(plan.id).toArray(),
  ])

  const phaseNameById = new Map(phases.map((p) => [p.id, p.name]))
  const templateById = new Map(templates.map((t) => [t.id, t]))
  const instancesByWeek = new Map<number, WorkoutInstance[]>()
  for (const instance of instances) {
    const list = instancesByWeek.get(instance.weekNumber) ?? []
    list.push(instance)
    instancesByWeek.set(instance.weekNumber, list)
  }

  const weekSummaries: WeekSummary[] = weeks
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((week) => {
      const weekInstances = (instancesByWeek.get(week.weekNumber) ?? []).sort((a, b) => a.sessionSlot - b.sessionSlot)
      const sessions: WeekSessionSummary[] = weekInstances.map((instance) => {
        const template = templateById.get(instance.templateId)
        return {
          instanceId: instance.id, templateId: instance.templateId, name: template?.name ?? 'Session',
          kind: template?.kind ?? 'recovery', priority: instance.priority, status: instance.status,
          frozen: instance.frozen, sessionSlot: instance.sessionSlot, scheduledDate: instance.scheduledDate,
        }
      })
      return {
        planWeekId: week.id, weekNumber: week.weekNumber, label: week.label,
        phaseName: phaseNameById.get(week.phaseId) ?? '', isDeload: week.isDeload, sessions,
      }
    })

  return { planId: plan.id, planName: plan.name, weeks: weekSummaries }
}

export interface EditableExercise {
  instancePrescription: InstancePrescription
  exercise: Exercise
}

export interface WorkoutEditorData {
  instance: WorkoutInstance
  templateName: string
  /** The template's CURRENT notes — used to prefill the metadata form so an
   * unedited save never overwrites real notes with a blank string (§ the
   * "prefilled but unpersisted" trap this project has already hit once). */
  templateNotes: string
  exercises: EditableExercise[]
}

/** One session's full editable content: the instance, its template's name/
 * notes (display + prefill), and every `InstancePrescription` it currently
 * carries, each paired with its resolved `Exercise` row, in `order`. */
export async function loadWorkoutEditorData(instanceId: string): Promise<WorkoutEditorData | undefined> {
  const instance = await db.workoutInstances.get(instanceId)
  if (!instance) return undefined
  const template = await db.workoutTemplates.get(instance.templateId)

  const prescriptions = await db.instancePrescriptions.where('instanceId').equals(instanceId).sortBy('order')
  const exercises: EditableExercise[] = []
  for (const ip of prescriptions) {
    const exercise = await db.exercises.get(ip.exerciseId)
    if (exercise) exercises.push({ instancePrescription: ip, exercise })
  }

  return { instance, templateName: template?.name ?? 'Session', templateNotes: template?.notes ?? '', exercises }
}
