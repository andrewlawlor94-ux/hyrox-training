import { db } from '@/data/db'
import type { Exercise, ExerciseCategory, ISOInstant, StrengthSet } from '@/data/types'
import type { SessionPerformance, SetPerformance } from '@/domain/strength/oneRepMax'
import { newId } from './ids'

/** ISO instant/date strings share the `YYYY-MM-DD` prefix; slicing to this
 * length turns a set's `completedAt` into the `ISODate` a session groups by. */
const ISO_DATE_LENGTH = 10

export async function listExercises(opts?: { includeArchived?: boolean; category?: ExerciseCategory; search?: string }): Promise<Exercise[]> {
  let exercises = await db.exercises.toArray()
  if (!opts?.includeArchived) exercises = exercises.filter((e) => !e.isArchived)
  if (opts?.category !== undefined) exercises = exercises.filter((e) => e.category === opts.category)
  if (opts?.search !== undefined && opts.search.length > 0) {
    const needle = opts.search.toLowerCase()
    exercises = exercises.filter((e) => e.name.toLowerCase().includes(needle))
  }
  return exercises
}

export async function createExercise(input: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'isSeeded'>, now: ISOInstant): Promise<Exercise> {
  const exercise: Exercise = { ...input, id: newId('ex'), createdAt: now, updatedAt: now, isSeeded: false }
  await db.exercises.add(exercise)
  return exercise
}

/**
 * Patches the `Exercise` row only. Nothing here touches `InstancePrescription`
 * or `StrengthSet` rows — an exercise-default edit (e.g. `defaultRestSec`,
 * `progressionIncrement`) must never retroactively change an already
 * scheduled prescription snapshot or a completed set.
 */
export async function updateExercise(id: string, patch: Partial<Exercise>, now: ISOInstant): Promise<void> {
  const current = await db.exercises.get(id)
  if (!current) throw new Error(`No Exercise "${id}"`)
  await db.exercises.put({ ...current, ...patch, id, updatedAt: now })
}

export async function duplicateExercise(id: string, now: ISOInstant): Promise<Exercise> {
  const source = await db.exercises.get(id)
  if (!source) throw new Error(`No Exercise "${id}"`)
  const copy: Exercise = { ...source, id: newId('ex'), name: `${source.name} (copy)`, isSeeded: false, createdAt: now, updatedAt: now }
  await db.exercises.add(copy)
  return copy
}

export async function archiveExercise(id: string, now: ISOInstant): Promise<void> {
  await updateExercise(id, { isArchived: true }, now)
}

export async function restoreExercise(id: string, now: ISOInstant): Promise<void> {
  await updateExercise(id, { isArchived: false }, now)
}

/**
 * The strength recommendation engine's `StrengthSessionHistory` takes the
 * first completed set of a session as the working weight and has no
 * `isWarmup` field of its own — so warm-up sets MUST be filtered out here,
 * not downstream. `isCompleted` is filtered too: an in-progress, unlogged
 * set carries no performance data worth reporting.
 */
export async function exerciseHistory(exerciseId: string): Promise<SessionPerformance[]> {
  const sets = await db.strengthSets
    .where('exerciseId').equals(exerciseId)
    .filter((s) => s.isCompleted && !s.isWarmup)
    .toArray()

  const byInstance = new Map<string, StrengthSet[]>()
  for (const s of sets) {
    const list = byInstance.get(s.instanceId) ?? []
    list.push(s)
    byInstance.set(s.instanceId, list)
  }

  const sessions: SessionPerformance[] = []
  for (const instanceSets of byInstance.values()) {
    const ordered = [...instanceSets].sort((a, b) => a.setIndex - b.setIndex)
    const first = ordered[0]
    if (first?.completedAt === undefined) continue

    const setPerfs: SetPerformance[] = []
    for (const s of ordered) {
      if (s.weight === undefined || s.reps === undefined || s.unit === undefined) continue
      setPerfs.push({ weight: s.weight, reps: s.reps, unit: s.unit, ...(s.rir !== undefined ? { rir: s.rir } : {}) })
    }
    sessions.push({ date: first.completedAt.slice(0, ISO_DATE_LENGTH), sets: setPerfs })
  }

  return sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
