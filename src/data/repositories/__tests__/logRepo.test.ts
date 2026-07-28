import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import type { WorkoutInstance } from '@/data/types'
import { HistoryImmutableError } from '@/data/errors'
import { listSymptomLogs, saveRunLog, saveStationLog, saveSymptomLog } from '../logRepo'

const NOW = '2026-07-27T10:00:00.000Z'

function makeInstance(overrides: Partial<WorkoutInstance> = {}): WorkoutInstance {
  return {
    id: 'wi_1', planId: 'plan_1', templateId: 'tmpl_1', weekNumber: 1, sessionSlot: 1,
    plannedDate: '2026-07-27', scheduledDate: '2026-07-27', sequence: 0, priority: 'essential',
    recoveryTags: [], status: 'inProgress', isManualOverride: false, frozen: false,
    ...overrides,
  }
}

beforeEach(async () => { await resetDatabase() })

describe('logRepo immutability guard, per table', () => {
  it('saveRunLog on a frozen instance throws HistoryImmutableError and writes nothing', async () => {
    await db.workoutInstances.add(makeInstance({ frozen: true, status: 'completed' }))
    const log = { id: 'rl_1', instanceId: 'wi_1', distanceKm: 5, durationSec: 1500, surface: 'road' as const, runType: 'easy' as const, notes: '', loggedAt: NOW }
    await expect(saveRunLog(log, [])).rejects.toBeInstanceOf(HistoryImmutableError)
    expect(await db.runLogs.get('rl_1')).toBeUndefined()
  })

  it('saveRunLog on a frozen instance does not write its intervalSplits either', async () => {
    await db.workoutInstances.add(makeInstance({ frozen: true, status: 'completed' }))
    const log = { id: 'rl_1', instanceId: 'wi_1', distanceKm: 5, durationSec: 1500, surface: 'road' as const, runType: 'intervals' as const, notes: '', loggedAt: NOW }
    const splits = [{ id: 'split_1', runLogId: 'rl_1', index: 0, kind: 'work' as const, distanceM: 1000 }]
    await expect(saveRunLog(log, splits)).rejects.toBeInstanceOf(HistoryImmutableError)
    expect(await db.intervalSplits.get('split_1')).toBeUndefined()
  })

  it('saveRunLog on a mutable instance succeeds and persists both the log and its splits', async () => {
    await db.workoutInstances.add(makeInstance())
    const log = { id: 'rl_1', instanceId: 'wi_1', distanceKm: 5, durationSec: 1500, surface: 'road' as const, runType: 'intervals' as const, notes: '', loggedAt: NOW }
    const splits = [{ id: 'split_1', runLogId: 'rl_1', index: 0, kind: 'work' as const, distanceM: 1000 }]
    await saveRunLog(log, splits)
    expect(await db.runLogs.get('rl_1')).toBeDefined()
    expect(await db.intervalSplits.get('split_1')).toBeDefined()
  })

  it('saveStationLog on a frozen instance throws HistoryImmutableError', async () => {
    await db.workoutInstances.add(makeInstance({ frozen: true, status: 'completed' }))
    const log = { id: 'sl_1', instanceId: 'wi_1', station: 'sledPush' as const, notes: '' }
    await expect(saveStationLog(log)).rejects.toBeInstanceOf(HistoryImmutableError)
    expect(await db.stationLogs.get('sl_1')).toBeUndefined()
  })

  it('saveStationLog on a mutable instance succeeds', async () => {
    await db.workoutInstances.add(makeInstance())
    const log = { id: 'sl_1', instanceId: 'wi_1', station: 'sledPush' as const, notes: '' }
    await saveStationLog(log)
    expect(await db.stationLogs.get('sl_1')).toBeDefined()
  })

  it('saveSymptomLog on a frozen instance throws HistoryImmutableError when it names an instanceId', async () => {
    await db.workoutInstances.add(makeInstance({ frozen: true, status: 'completed' }))
    const log = { id: 'sy_1', instanceId: 'wi_1', forDate: '2026-07-27', sessionRpe: 5, shinPain: 2, sciaticPain: 1, notes: '', loggedAt: NOW }
    await expect(saveSymptomLog(log)).rejects.toBeInstanceOf(HistoryImmutableError)
    expect(await db.symptomLogs.get('sy_1')).toBeUndefined()
  })

  it('saveSymptomLog with no instanceId (a standalone daily check-in) is never guarded and always succeeds', async () => {
    const log = { id: 'sy_2', forDate: '2026-07-27', sessionRpe: 5, shinPain: 2, sciaticPain: 1, notes: '', loggedAt: NOW }
    await saveSymptomLog(log)
    expect(await db.symptomLogs.get('sy_2')).toBeDefined()
  })

  it('listSymptomLogs returns logs sorted by forDate', async () => {
    await saveSymptomLog({ id: 'sy_a', forDate: '2026-07-27', sessionRpe: 5, shinPain: 0, sciaticPain: 0, notes: '', loggedAt: NOW })
    await saveSymptomLog({ id: 'sy_b', forDate: '2026-07-20', sessionRpe: 5, shinPain: 0, sciaticPain: 0, notes: '', loggedAt: NOW })
    const logs = await listSymptomLogs()
    expect(logs.map((l) => l.id)).toEqual(['sy_b', 'sy_a'])
  })
})
