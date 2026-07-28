import { db } from '@/data/db'
import type { ISODate, WorkoutInstance, WorkoutStatus, ScheduleEvent } from '@/data/types'
import type { QueueTemplate } from '@/domain/queue/recompute'
import { recomputeQueue } from '@/domain/queue/recompute'
import { newId } from './ids'
import { getSettings } from './settingsRepo'

const MIDNIGHT_UTC_SUFFIX = 'T00:00:00.000Z'

/**
 * Appends one row to the append-only schedule journal. This is the ONLY
 * function in the whole repository layer permitted to write to
 * `scheduleEvents`, and it only ever `add`s — never `put`s or `delete`s —
 * which is what makes "the count only ever grows" hold structurally rather
 * than by convention. Every other repository that needs to record a
 * schedule fact (completing a workout, changing the race goal, resetting
 * recommendations) imports this function rather than touching the table
 * directly.
 */
export async function appendEvent(event: Omit<ScheduleEvent, 'id'>): Promise<void> {
  await db.scheduleEvents.add({ ...event, id: newId('evt') })
}

/** Read-only; returned in `at` order (id as a tiebreaker) so callers get a
 * deterministic replay order matching the domain engine's own tie-break. */
export async function listEvents(): Promise<ScheduleEvent[]> {
  const events = await db.scheduleEvents.toArray()
  return events.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1
    if (a.id === b.id) return 0
    return a.id < b.id ? -1 : 1
  })
}

/** Pins `instanceId` (a `WorkoutInstance` row id) onto `date`. Stored
 * internally against the instance's `templateId` — see `syncQueue` below for
 * why the queue domain's `ScheduleOverride.instanceId` field actually holds a
 * template id. Replaces any prior override for the same instance rather than
 * accumulating dead rows (unlike `scheduleEvents`, `scheduleOverrides` is not
 * required to be append-only). */
export async function setOverride(args: { instanceId: string; date: ISODate; now: string }): Promise<void> {
  const instance = await db.workoutInstances.get(args.instanceId)
  if (!instance) throw new Error(`No WorkoutInstance "${args.instanceId}"`)
  await db.scheduleOverrides.where('instanceId').equals(instance.templateId).delete()
  await db.scheduleOverrides.add({
    id: newId('ovr'), instanceId: instance.templateId, date: args.date, isPinned: true, createdAt: args.now,
  })
}

export async function clearOverride(instanceId: string): Promise<void> {
  const instance = await db.workoutInstances.get(instanceId)
  if (!instance) return
  await db.scheduleOverrides.where('instanceId').equals(instance.templateId).delete()
}

/**
 * Appends the control event that tells replay to discard every prior
 * MOVE/DEFER while keeping every completion (`effectiveEvents` in
 * `@/domain/queue/replay`), and clears every pinned override outright —
 * `ScheduleOverride` rows are read directly by `recomputeQueue` regardless of
 * event history, so a reset that only touched `scheduleEvents` would leave
 * pins in effect forever. Has no visible effect until the next `syncQueue`.
 */
export async function resetRecommendations(now: string): Promise<void> {
  await appendEvent({ at: now, type: 'RESET_RECOMMENDATIONS', payload: {} })
  await db.scheduleOverrides.clear()
}

/** Statuses `recomputeQueue` never produces and must never be clobbered by a
 * recompute — see the doc comment on `syncQueue`. */
const PRESERVE_STATUSES: readonly WorkoutStatus[] = ['inProgress']

function withDerivedFields(
  instance: WorkoutInstance,
  status: WorkoutStatus,
  scheduledDate: ISODate | null,
  isManualOverride: boolean,
  adjustmentReason: string | null,
): WorkoutInstance {
  return {
    id: instance.id,
    planId: instance.planId,
    templateId: instance.templateId,
    weekNumber: instance.weekNumber,
    sessionSlot: instance.sessionSlot,
    plannedDate: instance.plannedDate,
    scheduledDate: scheduledDate ?? instance.scheduledDate,
    sequence: instance.sequence,
    priority: instance.priority,
    recoveryTags: instance.recoveryTags,
    status,
    isManualOverride,
    ...(instance.startedAt !== undefined ? { startedAt: instance.startedAt } : {}),
    ...(instance.completedAt !== undefined ? { completedAt: instance.completedAt } : {}),
    ...(instance.completedForDate !== undefined ? { completedForDate: instance.completedForDate } : {}),
    ...(instance.droppedAt !== undefined ? { droppedAt: instance.droppedAt } : {}),
    frozen: instance.frozen,
    ...(adjustmentReason !== null ? { adjustmentReason } : {}),
  }
}

/**
 * Recomputes the schedule from the immutable plan + append-only journal +
 * overrides, then persists **only** `scheduledDate`, `status`,
 * `adjustmentReason`, and `isManualOverride` back onto non-frozen
 * `WorkoutInstance` rows — never onto a frozen one, and never any other
 * field. Idempotent: given the same `today` and unchanged events/overrides,
 * `recomputeQueue` is a pure function of them, so re-running produces the
 * identical derived instance state on every call (`queueExplanations` rows
 * get fresh ids each run since the table is a fully-replaced cache, but their
 * content is identical).
 *
 * Id mapping: `WorkoutTemplate.id` is the domain's `QueueTemplate.templateId`
 * (the stable key that `ScheduleEvent`/`ScheduleOverride`'s oddly-named
 * `instanceId` field actually stores). Each `WorkoutInstance` was
 * materialized 1:1 from one `WorkoutTemplate` and keeps that id in its own
 * `templateId` field, so this function builds a `templateId -> WorkoutInstance`
 * map to translate `recomputeQueue`'s per-template result back onto the
 * right database row.
 *
 * `status: 'inProgress'` is left untouched: the queue engine's replay never
 * produces that status (no event type represents "currently being worked
 * through"), so blindly overwriting it back to `upcoming` would silently
 * discard the athlete's in-flight session every time the queue recomputes.
 * `available` (today's session, ready to start) is likewise not something
 * `recomputeQueue` knows about — it is derived here, from `today`, which is
 * exactly why this function (not the domain) takes `today` as a parameter.
 */
export async function syncQueue(today: ISODate): Promise<ReturnType<typeof recomputeQueue>> {
  return db.transaction(
    'rw',
    [db.settings, db.plans, db.raceGoals, db.workoutTemplates, db.planWeeks, db.workoutInstances, db.scheduleEvents, db.scheduleOverrides, db.queueExplanations],
    async () => {
      const settings = await getSettings()
      const plan = await db.plans.get(settings.activePlanId)
      if (!plan) return { instances: [], explanations: [], dropped: [] }

      const activeGoal = await db.raceGoals.filter((g) => g.isActive).first()
      const goal = activeGoal ?? (await db.raceGoals.get(plan.raceGoalId))
      if (!goal) return { instances: [], explanations: [], dropped: [] }

      const [templates, planWeeks, instances, events, overrides] = await Promise.all([
        db.workoutTemplates.where('planId').equals(plan.id).toArray(),
        db.planWeeks.where('planId').equals(plan.id).toArray(),
        db.workoutInstances.where('planId').equals(plan.id).toArray(),
        db.scheduleEvents.toArray(),
        db.scheduleOverrides.toArray(),
      ])

      const weekNumberByPlanWeekId = new Map(planWeeks.map((w) => [w.id, w.weekNumber]))
      const instanceByTemplateId = new Map(instances.map((i) => [i.templateId, i]))

      const queueTemplates: QueueTemplate[] = templates.map((t) => ({
        templateId: t.id,
        weekNumber: weekNumberByPlanWeekId.get(t.planWeekId) ?? 0,
        sessionSlot: t.sessionSlot,
        sequenceInWeek: t.sequenceInWeek,
        priority: t.priority,
        recoveryTags: [...t.recoveryTags],
        name: t.name,
      }))

      const result = recomputeQueue({
        planStartDate: plan.startDate,
        raceDate: goal.raceDate,
        templates: queueTemplates,
        events,
        overrides,
        today,
      })

      for (const scheduled of result.instances) {
        const instance = instanceByTemplateId.get(scheduled.templateId)
        if (!instance || instance.frozen || PRESERVE_STATUSES.includes(instance.status)) continue

        const derivedStatus: WorkoutStatus =
          scheduled.status === 'upcoming' && scheduled.scheduledDate === today ? 'available' : scheduled.status

        await db.workoutInstances.put(
          withDerivedFields(instance, derivedStatus, scheduled.scheduledDate, scheduled.isManualOverride, scheduled.adjustmentReason),
        )
      }

      // queueExplanations is a fully-derived cache (never hand-authored), so
      // clearing and rewriting it whole each run is simpler than tracking
      // "affected weeks" and is equally correct.
      await db.queueExplanations.clear()
      await db.queueExplanations.bulkAdd(
        result.explanations.map((e) => {
          const instanceId = e.templateId !== null ? instanceByTemplateId.get(e.templateId)?.id : undefined
          return {
            id: newId('exp'),
            ...(instanceId !== undefined ? { instanceId } : {}),
            ...(e.weekNumber !== null ? { weekNumber: e.weekNumber } : {}),
            at: `${today}${MIDNIGHT_UTC_SUFFIX}`,
            kind: 'adjustment',
            text: e.text,
          }
        }),
      )

      return result
    },
  )
}
