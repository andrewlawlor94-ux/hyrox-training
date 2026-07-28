import { beforeEach, describe, expect, it } from 'vitest'
import { db, openDb, resetDatabase, SCHEMA_VERSION } from '../db'
import { classifyDbError } from '../errors'

beforeEach(async () => { await resetDatabase() })

describe('openDb', () => {
  it('opens at the current schema version', async () => {
    const opened = await openDb()
    expect(opened.verno).toBe(SCHEMA_VERSION)
  })

  it('exposes every declared table', async () => {
    await openDb()
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual([
      'athleteProfile', 'exercises', 'hyroxStandards', 'instancePrescriptions',
      'intervalSplits', 'milestoneState', 'planPhases', 'planWeeks', 'plans',
      'prescriptions', 'raceGoals', 'restTimerState', 'runLogs', 'safetyBackups',
      'scheduleEvents', 'scheduleOverrides', 'queueExplanations', 'settings',
      'stationLogs', 'strengthSets', 'symptomLogs', 'workoutInstances', 'workoutTemplates',
    ].sort())
  })

  it('round-trips a record', async () => {
    await openDb()
    await db.exercises.put({
      id: 'ex_1', name: 'Back squat', category: 'squat', measurementType: 'strengthSets',
      loadStyle: 'totalBarbell', defaultUnit: 'lb', defaultRestSec: 150,
      progressionIncrement: 5, incrementUnit: 'lb', defaultSets: 4, repMin: 4, repMax: 6,
      techniqueNotes: '', isArchived: false, isSeeded: true,
      createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
    })
    expect((await db.exercises.get('ex_1'))?.name).toBe('Back squat')
  })

  it('is idempotent when called twice', async () => {
    await openDb()
    await expect(openDb()).resolves.toBeDefined()
  })
})

describe('classifyDbError', () => {
  it('recognizes a quota error', () => {
    expect(classifyDbError(new DOMException('full', 'QuotaExceededError'))).toBe('quotaExceeded')
  })

  it('recognizes a blocked upgrade', () => {
    expect(classifyDbError({ name: 'VersionError' })).toBe('upgradeBlocked')
  })

  it('recognizes denied access', () => {
    expect(classifyDbError(new DOMException('nope', 'SecurityError'))).toBe('accessDenied')
  })

  it('falls back to unknown', () => {
    expect(classifyDbError(new Error('something else'))).toBe('unknown')
  })

  it('does not throw on a null input', () => {
    expect(classifyDbError(null)).toBe('unknown')
  })
})
