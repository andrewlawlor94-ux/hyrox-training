import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import type { WorkoutInstance, WorkoutTemplate } from '@/data/types'
import { updateWorkoutMetadata } from '../workoutMetadataRepo'

const NOW = '2026-07-27T10:00:00.000Z'

async function seedFixture(): Promise<void> {
  await db.plans.add({ id: 'plan_1', name: 'Test plan', weeksCount: 1, status: 'active', startDate: '2026-07-06', raceGoalId: 'goal_1', createdAt: NOW })
  const template: WorkoutTemplate = {
    id: 'tmpl_1', planId: 'plan_1', planWeekId: 'week_1', sessionSlot: 1, sequenceInWeek: 0,
    name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 60, notes: '',
  }
  await db.workoutTemplates.add(template)
  const instances: WorkoutInstance[] = [
    { id: 'wi_upcoming', planId: 'plan_1', templateId: 'tmpl_1', weekNumber: 1, sessionSlot: 1, plannedDate: '2026-07-06', scheduledDate: '2026-07-06', sequence: 0, priority: 'essential', recoveryTags: [], status: 'upcoming', isManualOverride: false, frozen: false },
  ]
  await db.workoutInstances.bulkAdd(instances)
}

beforeEach(async () => {
  await resetDatabase()
  await seedFixture()
})

describe('updateWorkoutMetadata', () => {
  it('patches the template and, when priority changes, the instance snapshot too', async () => {
    await updateWorkoutMetadata({ instanceId: 'wi_upcoming', name: 'Renamed', priority: 'optional', notes: 'Go easy today' })
    const template = await db.workoutTemplates.get('tmpl_1')
    expect(template?.name).toBe('Renamed')
    expect(template?.priority).toBe('optional')
    expect(template?.notes).toBe('Go easy today')
    expect((await db.workoutInstances.get('wi_upcoming'))?.priority).toBe('optional')
  })

  it('leaves the instance priority untouched when priority is not part of the patch', async () => {
    await updateWorkoutMetadata({ instanceId: 'wi_upcoming', notes: 'Just a note' })
    expect((await db.workoutInstances.get('wi_upcoming'))?.priority).toBe('essential')
  })

  it('throws on a frozen instance', async () => {
    await db.workoutInstances.put({
      ...(await db.workoutInstances.get('wi_upcoming'))!, frozen: true, status: 'completed', completedAt: NOW, completedForDate: '2026-07-06',
    })
    await expect(updateWorkoutMetadata({ instanceId: 'wi_upcoming', name: 'x' })).rejects.toThrow(/immutable/i)
  })
})
