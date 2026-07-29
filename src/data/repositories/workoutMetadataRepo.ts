// Task 27 (§14): editing a session's own name/priority/notes/estimated
// duration — the `WorkoutTemplate` fields, not any exercise's `Prescription`.
// One small function, kept in its own file rather than pushing
// `planEditRepo.ts` over the line-count guideline.
import { db } from '@/data/db'
import type { Priority } from '@/data/types'
import { assertMutable } from './guard'

export interface WorkoutMetadataPatch {
  instanceId: string
  name?: string
  priority?: Priority
  notes?: string
  estMinutes?: number
}

/**
 * Patches a session's `WorkoutTemplate` row and, when `priority` changes,
 * the owning `WorkoutInstance`'s own snapshot too (the queue engine reads
 * priority from the template for placement, but the instance carries its
 * own copy for display — see `scheduleRepo.syncQueue`'s doc comment on why
 * it never rewrites `priority` itself). Guarded: throws on a frozen instance.
 */
export async function updateWorkoutMetadata(args: WorkoutMetadataPatch): Promise<void> {
  return db.transaction('rw', db.tables, async () => {
    const instance = await db.workoutInstances.get(args.instanceId)
    if (!instance) throw new Error(`No WorkoutInstance "${args.instanceId}"`)
    assertMutable(instance)
    const template = await db.workoutTemplates.get(instance.templateId)
    if (!template) throw new Error(`No WorkoutTemplate "${instance.templateId}"`)

    await db.workoutTemplates.put({
      ...template,
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.priority !== undefined ? { priority: args.priority } : {}),
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      ...(args.estMinutes !== undefined ? { estMinutes: args.estMinutes } : {}),
    })

    if (args.priority !== undefined) {
      await db.workoutInstances.put({ ...instance, priority: args.priority })
    }
  })
}
