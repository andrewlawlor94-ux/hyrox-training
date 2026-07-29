import { db } from '@/data/db'

/**
 * How many of this exercise's `InstancePrescription` rows belong to a
 * `WorkoutInstance` that isn't `frozen` yet -- i.e. still-scheduled work, not
 * completed history. Reuses `frozen` (the same immutability flag
 * `EditPrescriptionSheet` already gates on) rather than inventing a second
 * "is this instance still active" rule from `WorkoutStatus`.
 *
 * Purely informational: nothing in this feature blocks archiving on this
 * count being non-zero (see `ExerciseDetail`'s doc comment for why). Pure
 * read, safe inside `useLiveQuery`.
 */
export async function countScheduledPrescriptions(exerciseId: string): Promise<number> {
  const prescriptions = await db.instancePrescriptions.where('exerciseId').equals(exerciseId).toArray()
  if (prescriptions.length === 0) return 0

  const instanceIds = [...new Set(prescriptions.map((p) => p.instanceId))]
  const instances = await db.workoutInstances.bulkGet(instanceIds)
  const openInstanceIds = new Set(
    instances.filter((instance): instance is NonNullable<typeof instance> => instance !== undefined && !instance.frozen)
      .map((instance) => instance.id),
  )
  return prescriptions.filter((p) => openInstanceIds.has(p.instanceId)).length
}
