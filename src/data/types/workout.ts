import type { ISODate, ISOInstant } from './primitives'
import type { Priority, RecoveryTag, WorkoutStatus } from './enums'
import type { Prescription } from './plan'

/**
 * A scheduled occurrence of a WorkoutTemplate.
 *
 * `frozen` is the immutability flag: once true, a repository guard rejects
 * writes unless an explicit history-edit path is taken, so completed history
 * is never mutated by a later template edit.
 *
 * `plannedDate` is where the template would land with no adjustments;
 * `scheduledDate` is where the queue engine actually placed it after
 * replaying missed/deferred sessions. `completedForDate` is set when a
 * workout is recorded as completed on an earlier date than it runs.
 */
export interface WorkoutInstance {
  id: string
  planId: string
  templateId: string
  weekNumber: number
  sessionSlot: number
  plannedDate: ISODate
  scheduledDate: ISODate
  sequence: number
  priority: Priority
  recoveryTags: RecoveryTag[]
  status: WorkoutStatus
  adjustmentReason?: string
  isManualOverride: boolean
  startedAt?: ISOInstant
  completedAt?: ISOInstant
  completedForDate?: ISODate
  droppedAt?: ISOInstant
  frozen: boolean
}

/**
 * A snapshot of a Prescription taken at scheduling time, so editing a
 * template never retroactively changes a scheduled or completed workout.
 */
export interface InstancePrescription extends Prescription {
  instanceId: string
  /** Absent if the source prescription has since been deleted. */
  sourcePrescriptionId?: string
}
