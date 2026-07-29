import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, BACKUP_TABLES, MIGRATABLE_FROM_SCHEMA_VERSIONS, SUPPORTED_SCHEMA_VERSION } from '../constants'
import { validateBackup } from '../validate'
import type { BackupFile } from '../validate'

const NOW = '2026-07-27T10:00:00.000Z'

/** A structurally complete, empty-but-valid backup: every declared table
 * present as `[]`, every count `0`. Individual tests override just the
 * pieces they care about. */
function emptyFile(overrides?: Partial<BackupFile>): BackupFile {
  const data: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  for (const table of BACKUP_TABLES) {
    data[table] = []
    counts[table] = 0
  }
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    appVersion: '1.0.0',
    exportedAt: NOW,
    counts,
    data,
    ...overrides,
  }
}

function raw(file: unknown): string {
  return JSON.stringify(file)
}

describe('validateBackup', () => {
  it('validates a well-formed file and returns the parsed object', () => {
    const file = emptyFile()
    const result = validateBackup(raw(file))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.file.format).toBe(BACKUP_FORMAT)
      expect(result.file.schemaVersion).toBe(SUPPORTED_SCHEMA_VERSION)
      expect(result.file.data.plans).toEqual([])
    }
  })

  it('rejects non-JSON input as notJson without throwing', () => {
    expect(() => validateBackup('not { valid json')).not.toThrow()
    const result = validateBackup('not { valid json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.kind).toBe('notJson')
      expect(result.failure.message.length).toBeGreaterThan(0)
    }
  })

  it.each([
    ['an empty array', '[]'],
    ['an unrelated object', '{"hello":1}'],
    ['null', 'null'],
  ])('rejects valid JSON that is not a backup (%s) as wrongFormat', (_label, json) => {
    const result = validateBackup(json)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe('wrongFormat')
  })

  it('rejects a wrong format string as wrongFormat', () => {
    const file = emptyFile({ format: 'something-else' as typeof BACKUP_FORMAT })
    const result = validateBackup(raw(file))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe('wrongFormat')
  })

  it('rejects a schemaVersion greater than SUPPORTED_SCHEMA_VERSION as futureSchema, carrying found and supported', () => {
    const future = SUPPORTED_SCHEMA_VERSION + 1
    const file = emptyFile({ schemaVersion: future })
    const result = validateBackup(raw(file))
    expect(result.ok).toBe(false)
    if (!result.ok && result.failure.kind === 'futureSchema') {
      expect(result.failure.found).toBe(future)
      expect(result.failure.supported).toBe(SUPPORTED_SCHEMA_VERSION)
      expect(result.failure.message.length).toBeGreaterThan(0)
    } else {
      throw new Error('expected futureSchema failure')
    }
  })

  // DELIBERATE BEHAVIOUR CHANGE. This previously asserted that an older
  // schemaVersion was accepted, on the stated grounds that "older backups
  // migrate forward". They did not: `importBackup` stamped
  // `settings.schemaVersion` as current, and Dexie's version chain only
  // upgrades a database it OPENS — it never touches rows bulk-put into an
  // already-current one. So an older file was accepted and then declared
  // migrated without anything migrating it. Refusing is the correct failure
  // here: a refusal is recoverable, a mis-stamped import is not.
  it('rejects an older schemaVersion this build cannot upgrade from, as unmigratableSchema', () => {
    const older = SUPPORTED_SCHEMA_VERSION - 1
    const file = emptyFile({ schemaVersion: older })
    const result = validateBackup(raw(file))
    expect(result.ok).toBe(false)
    if (!result.ok && result.failure.kind === 'unmigratableSchema') {
      expect(result.failure.found).toBe(older)
      expect(result.failure.supported).toBe(SUPPORTED_SCHEMA_VERSION)
      expect(result.failure.message).toMatch(/Nothing was changed/)
    } else {
      throw new Error('expected unmigratableSchema failure')
    }
  })

  it('gates that refusal on MIGRATABLE_FROM_SCHEMA_VERSIONS, which is currently empty', () => {
    // Documents the escape hatch, so the day schema 2 ships the author has to
    // add `1` to MIGRATABLE_FROM_SCHEMA_VERSIONS (plus the data migration)
    // rather than rediscover why old files are refused. Asserting the list is
    // empty is the point: the refusal above is a consequence of that emptiness,
    // not a blanket ban on older files.
    expect(MIGRATABLE_FROM_SCHEMA_VERSIONS).toEqual([])
  })

  it('accepts a file at exactly SUPPORTED_SCHEMA_VERSION', () => {
    const result = validateBackup(raw(emptyFile({ schemaVersion: SUPPORTED_SCHEMA_VERSION })))
    expect(result.ok).toBe(true)
  })

  it('rejects a file missing a required table key as missingTable, naming the table', () => {
    const file = emptyFile()
    const data = { ...file.data }
    delete data.plans
    const result = validateBackup(raw({ ...file, data }))
    expect(result.ok).toBe(false)
    if (!result.ok && result.failure.kind === 'missingTable') {
      expect(result.failure.table).toBe('plans')
      expect(result.failure.message).toMatch(/plans/)
    } else {
      throw new Error('expected missingTable failure')
    }
  })

  it('rejects a counts entry that disagrees with the actual array length as countMismatch, naming the table', () => {
    const file = emptyFile()
    const counts = { ...file.counts, plans: 3 }
    const result = validateBackup(raw({ ...file, counts }))
    expect(result.ok).toBe(false)
    if (!result.ok && result.failure.kind === 'countMismatch') {
      expect(result.failure.table).toBe('plans')
      expect(result.failure.message).toMatch(/plans/)
    } else {
      throw new Error('expected countMismatch failure')
    }
  })

  it('rejects a strengthSets row whose instanceId is absent from workoutInstances as brokenReference, naming table and field', () => {
    const file = emptyFile()
    const data = {
      ...file.data,
      strengthSets: [{ id: 'set_1', instanceId: 'wi_missing', instancePrescriptionId: 'ip_1', exerciseId: 'ex_1', setIndex: 0, isCompleted: false, isWarmup: false }],
    }
    const counts = { ...file.counts, strengthSets: 1 }
    const result = validateBackup(raw({ ...file, data, counts }))
    expect(result.ok).toBe(false)
    if (!result.ok && result.failure.kind === 'brokenReference') {
      expect(result.failure.table).toBe('strengthSets')
      expect(result.failure.field).toBe('instanceId')
      expect(result.failure.message).toMatch(/strengthSets/)
    } else {
      throw new Error('expected brokenReference failure')
    }
  })

  it('accepts a strengthSets row whose instanceId matches a real workoutInstances row', () => {
    const file = emptyFile()
    const data = {
      ...file.data,
      workoutInstances: [{ id: 'wi_1' }],
      strengthSets: [{ id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: 'ex_1', setIndex: 0, isCompleted: false, isWarmup: false }],
    }
    const counts = { ...file.counts, workoutInstances: 1, strengthSets: 1 }
    const result = validateBackup(raw({ ...file, data, counts }))
    expect(result.ok).toBe(true)
  })

  it('every failure kind carries a non-empty, specific message', () => {
    const cases: string[] = [
      'not json at all',
      '[]',
      raw(emptyFile({ format: 'wrong' as typeof BACKUP_FORMAT })),
      raw(emptyFile({ schemaVersion: SUPPORTED_SCHEMA_VERSION + 1 })),
    ]
    for (const input of cases) {
      const result = validateBackup(input)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.failure.message.length).toBeGreaterThan(0)
        expect(result.failure.message).not.toBe('invalid file')
      }
    }
  })

  it('is pure: validating a well-formed file never touches the database (no crash with no db open, no indexedDB access needed)', () => {
    // No `openDb()`/`resetDatabase()` call anywhere in this test file, and no
    // fake-indexeddb activity is required for every case above to pass —
    // that absence is itself the proof `validateBackup` is a pure string ->
    // result function, not one that reaches into Dexie.
    const result = validateBackup(raw(emptyFile()))
    expect(result.ok).toBe(true)
  })
})
