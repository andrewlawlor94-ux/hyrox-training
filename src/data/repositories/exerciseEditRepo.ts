// Task 27 (§13/§14): adding, removing, substituting, and reordering
// exercises WITHIN one workout instance/template. Sibling to
// `planEditRepo.ts` (session-level editing) -- split out to keep both files
// under the ~250-line guideline.
import { db } from '@/data/db'
import type { Exercise, InstancePrescription, Prescription } from '@/data/types'
import { assertMutable } from './guard'
import { newId } from './ids'

async function nextPrescriptionOrder(instanceId: string): Promise<number> {
  const existing = await db.instancePrescriptions.where('instanceId').equals(instanceId).toArray()
  return existing.reduce((max, p) => Math.max(max, p.order), -1) + 1
}

/** Legitimate template/exercise-level defaults (never an athlete-asserted
 * value like `targetLoad`/`targetRir` — those stay unset until logged). */
function defaultsFromExercise(exercise: Exercise): Pick<Prescription, 'restSec'> & Partial<Prescription> {
  return {
    restSec: exercise.defaultRestSec,
    ...(exercise.defaultSets !== undefined ? { sets: exercise.defaultSets } : {}),
    ...(exercise.repMin !== undefined ? { repMin: exercise.repMin } : {}),
    ...(exercise.repMax !== undefined ? { repMax: exercise.repMax } : {}),
    ...(exercise.defaultDistanceM !== undefined ? { distanceM: exercise.defaultDistanceM } : {}),
    ...(exercise.defaultDurationSec !== undefined ? { durationSec: exercise.defaultDurationSec } : {}),
  }
}

/** Adds an exercise to THIS occurrence only (§13's "add an exercise to a
 * current workout") — an `InstancePrescription` with no backing template
 * `Prescription`, so no future week is affected. */
export async function addExerciseToInstance(args: { instanceId: string; exerciseId: string }): Promise<InstancePrescription> {
  const instance = await db.workoutInstances.get(args.instanceId)
  if (!instance) throw new Error(`No WorkoutInstance "${args.instanceId}"`)
  assertMutable(instance)
  const exercise = await db.exercises.get(args.exerciseId)
  if (!exercise) throw new Error(`No Exercise "${args.exerciseId}"`)

  const order = await nextPrescriptionOrder(args.instanceId)
  const ip: InstancePrescription = {
    id: newId('ip'), instanceId: args.instanceId, templateId: instance.templateId, exerciseId: args.exerciseId,
    order, ...defaultsFromExercise(exercise),
  }
  await db.instancePrescriptions.add(ip)
  return ip
}

export interface AddExerciseToTemplateResult {
  prescription: Prescription
  /** How many OTHER future instances also received it (for UI feedback). */
  propagatedInstanceCount: number
}

/**
 * Adds an exercise to THIS occurrence's own template `Prescription` AND to
 * every future non-frozen occurrence of "the same recurring session" (§13's
 * "add to future workout templates"). The plan has no explicit recurrence
 * identity — each week's `WorkoutTemplate` is materialized as its own row —
 * so this matches later weeks' templates by `(sessionSlot, kind)`, the same
 * pair that determines which weekday and discipline a session is. This is a
 * documented judgment call, not a guaranteed-unique key; see the Task 27
 * report.
 */
export async function addExerciseToTemplate(args: { instanceId: string; exerciseId: string }): Promise<AddExerciseToTemplateResult> {
  return db.transaction('rw', db.tables, async () => {
    const instance = await db.workoutInstances.get(args.instanceId)
    if (!instance) throw new Error(`No WorkoutInstance "${args.instanceId}"`)
    assertMutable(instance)
    const template = await db.workoutTemplates.get(instance.templateId)
    if (!template) throw new Error(`No WorkoutTemplate "${instance.templateId}"`)
    const exercise = await db.exercises.get(args.exerciseId)
    if (!exercise) throw new Error(`No Exercise "${args.exerciseId}"`)

    const templatePrescriptions = await db.prescriptions.where('templateId').equals(template.id).toArray()
    const order = templatePrescriptions.reduce((max, p) => Math.max(max, p.order), -1) + 1
    const prescription: Prescription = {
      id: newId('rx'), templateId: template.id, exerciseId: args.exerciseId, order, ...defaultsFromExercise(exercise),
    }
    await db.prescriptions.add(prescription)

    const currentOrder = await nextPrescriptionOrder(args.instanceId)
    await db.instancePrescriptions.add({
      id: newId('ip'), instanceId: args.instanceId, templateId: template.id, exerciseId: args.exerciseId,
      order: currentOrder, sourcePrescriptionId: prescription.id, ...defaultsFromExercise(exercise),
    })

    const allTemplates = await db.workoutTemplates.where('planId').equals(instance.planId).toArray()
    const allInstances = await db.workoutInstances.where('planId').equals(instance.planId).toArray()
    const instanceByTemplateId = new Map(allInstances.map((i) => [i.templateId, i]))

    let propagatedInstanceCount = 0
    for (const t of allTemplates) {
      if (t.id === template.id || t.sessionSlot !== template.sessionSlot || t.kind !== template.kind) continue
      const futureInstance = instanceByTemplateId.get(t.id)
      if (!futureInstance || futureInstance.frozen || futureInstance.weekNumber <= instance.weekNumber) continue

      const futureTemplatePrescriptions = await db.prescriptions.where('templateId').equals(t.id).toArray()
      if (!futureTemplatePrescriptions.some((p) => p.exerciseId === args.exerciseId)) {
        const futureOrder = futureTemplatePrescriptions.reduce((max, p) => Math.max(max, p.order), -1) + 1
        await db.prescriptions.add({
          id: newId('rx'), templateId: t.id, exerciseId: args.exerciseId, order: futureOrder, ...defaultsFromExercise(exercise),
        })
      }

      const futureInstancePrescriptions = await db.instancePrescriptions.where('instanceId').equals(futureInstance.id).toArray()
      if (futureInstancePrescriptions.some((p) => p.exerciseId === args.exerciseId)) continue
      const futureIpOrder = futureInstancePrescriptions.reduce((max, p) => Math.max(max, p.order), -1) + 1
      await db.instancePrescriptions.add({
        id: newId('ip'), instanceId: futureInstance.id, templateId: t.id, exerciseId: args.exerciseId,
        order: futureIpOrder, ...defaultsFromExercise(exercise),
      })
      propagatedInstanceCount += 1
    }

    return { prescription, propagatedInstanceCount }
  })
}

/** Removes one exercise from a session (guarded: never on a frozen
 * instance), cascading to any `StrengthSet` rows already logged against it —
 * removing the exercise means discarding its unset-in-stone logs too. */
export async function removeExerciseFromInstance(instancePrescriptionId: string): Promise<void> {
  return db.transaction('rw', db.tables, async () => {
    const ip = await db.instancePrescriptions.get(instancePrescriptionId)
    if (!ip) return
    const instance = await db.workoutInstances.get(ip.instanceId)
    if (!instance) return
    assertMutable(instance)
    await db.strengthSets.where('instancePrescriptionId').equals(instancePrescriptionId).delete()
    await db.instancePrescriptions.delete(instancePrescriptionId)
  })
}

/** Swaps one exercise for another within a session, instance-scope only
 * (never touches the template) — any logged sets against the OLD exercise
 * are discarded since they no longer describe what's prescribed here. */
export async function substituteExerciseInInstance(args: { instancePrescriptionId: string; newExerciseId: string }): Promise<void> {
  return db.transaction('rw', db.tables, async () => {
    const ip = await db.instancePrescriptions.get(args.instancePrescriptionId)
    if (!ip) throw new Error(`No InstancePrescription "${args.instancePrescriptionId}"`)
    const instance = await db.workoutInstances.get(ip.instanceId)
    if (!instance) throw new Error(`No WorkoutInstance "${ip.instanceId}"`)
    assertMutable(instance)
    const newExercise = await db.exercises.get(args.newExerciseId)
    if (!newExercise) throw new Error(`No Exercise "${args.newExerciseId}"`)

    await db.strengthSets.where('instancePrescriptionId').equals(args.instancePrescriptionId).delete()
    const updated: Partial<InstancePrescription> = { ...ip, exerciseId: args.newExerciseId, ...defaultsFromExercise(newExercise) }
    delete updated.sourcePrescriptionId
    await db.instancePrescriptions.put(updated as InstancePrescription)
  })
}

/** Move-up/move-down for exercises within one session — swaps `order`
 * between two `InstancePrescription`s belonging to the SAME instance. */
export async function swapExerciseOrder(instancePrescriptionIdA: string, instancePrescriptionIdB: string): Promise<void> {
  return db.transaction('rw', db.tables, async () => {
    const [a, b] = await Promise.all([
      db.instancePrescriptions.get(instancePrescriptionIdA), db.instancePrescriptions.get(instancePrescriptionIdB),
    ])
    if (!a || !b) throw new Error('Both exercises must exist to reorder them')
    const instance = await db.workoutInstances.get(a.instanceId)
    if (!instance) throw new Error(`No WorkoutInstance "${a.instanceId}"`)
    assertMutable(instance)
    await db.instancePrescriptions.put({ ...a, order: b.order })
    await db.instancePrescriptions.put({ ...b, order: a.order })
  })
}
