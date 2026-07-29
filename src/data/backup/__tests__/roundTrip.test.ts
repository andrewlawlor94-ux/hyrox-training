import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase, SCHEMA_VERSION } from '@/data/db'
import { setOverride, updateSettings } from '@/data/repositories'
import { SUPPORTED_SCHEMA_VERSION, BACKUP_TABLES } from '@/domain/backup/constants'
import { seedTestDb } from '@/test/seedTestDb'
import { exportBackup } from '../exportBackup'
import { importBackup } from '../importBackup'

const NOW = '2026-01-06T09:00:00.000Z'
const LATER = '2026-01-06T10:00:00.000Z'
const APP_VERSION = '1.0.0'
const KNOWN_LAST_BACKUP_AT = '2026-01-04T00:00:00.000Z'

/** Snapshot of every portable table, sorted by `id` so array order (which
 * `bulkPut` does not guarantee matches insertion order) never causes a false
 * mismatch. */
async function snapshotAll(): Promise<Record<string, unknown[]>> {
  const snapshot: Record<string, unknown[]> = {}
  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = await db.table(table).toArray()
    snapshot[table] = [...rows].sort((a: unknown, b: unknown) => {
      const idA = (a as { id: string }).id
      const idB = (b as { id: string }).id
      return idA < idB ? -1 : idA > idB ? 1 : 0
    })
  }
  return snapshot
}

async function addScheduleOverride(): Promise<void> {
  const instance = await db.workoutInstances.toCollection().first()
  if (!instance) throw new Error('expected at least one seeded WorkoutInstance')
  await setOverride({ instanceId: instance.id, date: instance.scheduledDate, now: NOW })
}

beforeEach(async () => {
  await resetDatabase()
})

// The domain layer's purity guard forbids `src/domain/backup/constants.ts`
// from importing `SCHEMA_VERSION`/the table list from `@/data/schema.ts`
// directly (see that file's doc comments), so both are manually duplicated
// there. This data-layer test is allowed to import both sides and pins them
// equal — a schema bump that updates one but not the other fails here
// immediately instead of silently importing a "future" file as current or
// vice versa.
describe('domain/backup constants stay in sync with the data layer schema', () => {
  it('SUPPORTED_SCHEMA_VERSION equals the data layer SCHEMA_VERSION', async () => {
    await resetDatabase()
    expect(SUPPORTED_SCHEMA_VERSION).toBe(SCHEMA_VERSION)
  })

  it('BACKUP_TABLES is every Dexie table except safetyBackups', async () => {
    await resetDatabase()
    const allTableNames = db.tables.map((t) => t.name).sort()
    const expected = [...BACKUP_TABLES, 'safetyBackups'].sort()
    expect(allTableNames).toEqual(expected)
  })
})

describe('exportBackup', () => {
  it('produces JSON that parses and whose counts match the actual row counts per table', async () => {
    await seedTestDb({ withHistory: true })
    const { json, counts } = await exportBackup(NOW, APP_VERSION)
    const parsed = JSON.parse(json) as { counts: Record<string, number> }

    for (const table of BACKUP_TABLES) {
      const actual = await db.table(table).count()
      expect(parsed.counts[table]).toBe(actual)
      expect(counts[table]).toBe(actual)
    }
    // At least one table actually has real rows — otherwise every assertion
    // above passes vacuously against an empty database.
    expect(counts.workoutInstances).toBeGreaterThan(0)
    expect(counts.strengthSets).toBeGreaterThan(0)
  })

  it('produces human-readable JSON: newlines and two-space indentation', async () => {
    await seedTestDb()
    const { json } = await exportBackup(NOW, APP_VERSION)
    expect(json).toContain('\n')
    expect(json).toMatch(/\n {2}"format"/)
  })
})

describe('export -> import round trip', () => {
  it('restores every table to values deeply equal to the originals, including frozen: true on completed instances', async () => {
    await seedTestDb({ withHistory: true })
    await addScheduleOverride()

    const completedInstances = await db.workoutInstances.where('status').equals('completed').toArray()
    expect(completedInstances.length).toBeGreaterThan(0)
    for (const instance of completedInstances) expect(instance.frozen).toBe(true)

    const originalStrengthSets = await db.strengthSets.toArray()
    expect(originalStrengthSets.length).toBeGreaterThan(0)

    const before = await snapshotAll()
    const { json } = await exportBackup(NOW, APP_VERSION)

    await resetDatabase()
    const result = await importBackup(json, LATER)
    expect(result.ok).toBe(true)

    const after = await snapshotAll()
    for (const table of BACKUP_TABLES) {
      expect(after[table]).toEqual(before[table])
    }

    // Values, not just row presence: the specific weight/reps logged for
    // each restored strength set match what was actually logged, and every
    // completed instance is still frozen.
    const restoredStrengthSets = await db.strengthSets.toArray()
    for (const original of originalStrengthSets) {
      const restored = restoredStrengthSets.find((s) => s.id === original.id)
      expect(restored).toBeDefined()
      expect(restored?.weight).toBe(original.weight)
      expect(restored?.reps).toBe(original.reps)
    }
    for (const instance of completedInstances) {
      const restored = await db.workoutInstances.get(instance.id)
      expect(restored?.frozen).toBe(true)
      expect(restored?.completedAt).toBe(instance.completedAt)
    }
  })

  it('rejects an invalid file, returns ok:false, and leaves existing data byte-identical (zero writes)', async () => {
    await seedTestDb({ withHistory: true })
    const before = await snapshotAll()
    expect(await db.safetyBackups.get('pre-import')).toBeUndefined()

    const result = await importBackup('not valid json at all', LATER)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe('notJson')

    const after = await snapshotAll()
    for (const table of BACKUP_TABLES) expect(after[table]).toEqual(before[table])
    // The clearest proof of zero writes: the safety-backup row this
    // rejected import would have written on a *successful* validation never
    // got created at all.
    expect(await db.safetyBackups.get('pre-import')).toBeUndefined()
  })

  it('rejects a futureSchema file without altering data', async () => {
    await seedTestDb({ withHistory: true })
    const before = await snapshotAll()

    const { json } = await exportBackup(NOW, APP_VERSION)
    const parsed = JSON.parse(json) as { schemaVersion: number }
    const futureJson = JSON.stringify({ ...parsed, schemaVersion: SUPPORTED_SCHEMA_VERSION + 1 })

    const result = await importBackup(futureJson, LATER)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe('futureSchema')

    const after = await snapshotAll()
    for (const table of BACKUP_TABLES) expect(after[table]).toEqual(before[table])
    expect(await db.safetyBackups.get('pre-import')).toBeUndefined()
  })

  it('writes a safetyBackups "pre-import" row snapshotting the data that is about to be replaced', async () => {
    await seedTestDb({ withHistory: true })
    const baseline = await exportBackup(NOW, APP_VERSION)
    const baselineCounts = baseline.counts

    const result = await importBackup(baseline.json, LATER)
    expect(result.ok).toBe(true)

    const safety = await db.safetyBackups.get('pre-import')
    expect(safety).toBeDefined()
    expect(safety?.at).toBe(LATER)
    const safetyFile = JSON.parse(safety?.json ?? '{}') as { counts: Record<string, number> }
    for (const table of BACKUP_TABLES) {
      expect(safetyFile.counts[table]).toBe(baselineCounts[table])
    }
  })

  it('is idempotent: importing the same file twice in a row yields the same row counts', async () => {
    await seedTestDb({ withHistory: true })
    const { json } = await exportBackup(NOW, APP_VERSION)

    const first = await importBackup(json, LATER)
    const second = await importBackup(json, LATER)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (first.ok && second.ok) expect(second.counts).toEqual(first.counts)
  })

  it('after a successful import, settings.lastBackupAt is unchanged but settings.schemaVersion equals SCHEMA_VERSION', async () => {
    await seedTestDb()
    await updateSettings({ lastBackupAt: KNOWN_LAST_BACKUP_AT, schemaVersion: 0 })

    const { json } = await exportBackup(NOW, APP_VERSION)
    await resetDatabase()
    const result = await importBackup(json, LATER)
    expect(result.ok).toBe(true)

    const settings = await db.settings.get('app')
    expect(settings?.lastBackupAt).toBe(KNOWN_LAST_BACKUP_AT)
    expect(settings?.schemaVersion).toBe(SCHEMA_VERSION)
  })
})
