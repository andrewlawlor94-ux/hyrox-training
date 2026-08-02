import { db } from '@/data/db'
import type { ISODate, Priority, WorkoutStatus } from '@/data/types'
import { structureFor } from './homeViewModel'
import type { ExerciseStructure } from './types'

export interface SessionPreview {
  instanceId: string
  name: string
  phaseLabel: string
  weekNumber: number
  scheduledDate: ISODate
  status: WorkoutStatus
  priority: Priority
  estMinutes: number | undefined
  /** Every prescribed exercise with its dose, in the order the session runs. */
  structure: ExerciseStructure[]
  /** Already scheduled for today, so "Do today" would be a no-op. */
  isToday: boolean
  /** Completed history: no rescheduling, and nothing to start. */
  frozen: boolean
}

/**
 * Everything the session-preview sheet shows for one instance: what the session
 * is, when it is scheduled, and the exercises it prescribes.
 *
 * A read-only projection, deliberately separate from `loadWorkoutEditorData`
 * (which exists to EDIT a session and carries editable exercise rows). The
 * athlete asked to "click the workout and view what is planned" — that is a
 * different job from editing it, and conflating them would put edit controls in
 * a preview.
 *
 * Pure read, so it is safe inside `useLiveQuery`.
 */
export async function loadSessionPreview(instanceId: string, today: ISODate): Promise<SessionPreview | undefined> {
  const instance = await db.workoutInstances.get(instanceId)
  if (!instance) return undefined

  const template = await db.workoutTemplates.get(instance.templateId)
  // One query for the instance's prescriptions, ordered as the session runs.
  const prescriptions = await db.instancePrescriptions.where('instanceId').equals(instanceId).sortBy('order')

  const structure: ExerciseStructure[] = []
  for (const prescription of prescriptions) {
    const exercise = await db.exercises.get(prescription.exerciseId)
    // A prescription whose exercise is missing is skipped rather than rendered
    // as a blank row — same rule `loadWorkout` follows.
    if (!exercise) continue
    structure.push(structureFor(exercise, prescription))
  }

  const phase = template ? await db.planWeeks.get(template.planWeekId) : undefined
  const phaseName = phase ? (await db.planPhases.get(phase.phaseId))?.name ?? '' : ''

  return {
    instanceId,
    name: template?.name ?? '',
    phaseLabel: phaseName,
    weekNumber: instance.weekNumber,
    scheduledDate: instance.scheduledDate,
    status: instance.status,
    priority: instance.priority,
    estMinutes: template?.estMinutes,
    structure,
    isToday: instance.scheduledDate === today,
    frozen: instance.frozen,
  }
}
