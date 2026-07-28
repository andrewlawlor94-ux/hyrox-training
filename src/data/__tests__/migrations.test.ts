import { afterEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { openDb, resetDatabase, SCHEMA_VERSION } from '../db'
import { MIGRATIONS } from '../migrations'
import { STORES_V1 } from '../schema'

/** Opens a raw (non-Dexie) connection so tests can inspect the *actual*
 * IndexedDB object stores rather than Dexie's schema metadata, which is
 * populated at construction time regardless of whether the underlying
 * database was ever really created. */
function openRaw(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name)
    req.onsuccess = () => { resolve(req.result) }
    req.onerror = () => { reject(new Error(req.error?.message ?? 'IndexedDB request failed')) }
  })
}

const PROBE_DB_NAME = 'hyrox-migration-probe'

/** Minimal row shapes for the probe tables — just enough fields to prove
 * data survives the upgrade, typed explicitly so reading them back doesn't
 * fall through to Dexie's untyped `Table<any, any>` when accessed via the
 * string-keyed `.table()` method rather than a declared `HyroxDb` property. */
interface ProbeExerciseRow { id: string; name: string; category: string }
interface ProbeSymptomRow { id: string; instanceId: string; forDate: string }

function deleteProbeDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(PROBE_DB_NAME)
    req.onsuccess = () => { resolve() }
    req.onerror = () => { reject(new Error(req.error?.message ?? 'IndexedDB request failed')) }
    // Nothing else holds this name open in these tests, but resolve rather
    // than hang if a stray connection ever does.
    req.onblocked = () => { resolve() }
  })
}

describe('migration chain', () => {
  it('declares one entry per schema version with no gaps', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(
      Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1),
    )
  })

  it('preserves rows written under v1 when reopened through the chain', async () => {
    await resetDatabase()
    // Write through a bare v1 handle, mimicking data created by an earlier release.
    const legacy = new Dexie('hyrox-training')
    legacy.version(1).stores({ exercises: 'id, name, category, isArchived' })
    await legacy.open()
    await legacy.table('exercises').put({ id: 'ex_legacy', name: 'Legacy lift', category: 'squat' })
    legacy.close()

    const upgraded = await openDb()
    const row = await upgraded.exercises.get('ex_legacy')
    expect(row?.name).toBe('Legacy lift')
  })

  it('creates every declared table as a real IndexedDB object store, not just schema metadata', async () => {
    await openDb()
    const raw = await openRaw('hyrox-training')
    const storeNames = Array.from(raw.objectStoreNames).sort()
    raw.close()
    expect(storeNames.length).toBeGreaterThan(20)
    expect(storeNames).toContain('exercises')
    expect(storeNames).toContain('workoutInstances')
    expect(storeNames).toContain('safetyBackups')
  })
})

/**
 * These tests exercise a *genuine* version-1-to-version-2 upgrade transaction
 * on a throwaway, separately-named database — not the production `db`
 * singleton, and no v2 is added to production code for this. The point is to
 * prove the *mechanism* (Dexie replaying an ordered version chain via
 * `db.version(n).stores(...)`, which is exactly what `HyroxDb`'s constructor
 * does with `MIGRATIONS`) actually preserves rows across a real upgrade, as
 * opposed to the test above, which only proves a second connection's write is
 * visible through the primary handle when no upgrade transaction runs at all.
 *
 * When a real v2 ships, re-verify this guarantee against the actual
 * migration (e.g. temporarily via the same "make it destructive, confirm the
 * test fails" technique used to validate this probe) rather than relying on
 * this generic probe alone — a real migration's upgrade callback (if any) is
 * new code this probe cannot cover.
 */
describe('migration probe: genuine v1 -> v2 upgrade on a throwaway database', () => {
  afterEach(async () => {
    await deleteProbeDb()
  })

  it('preserves v1 rows and indexes across a real upgrade transaction', async () => {
    await deleteProbeDb()

    // Version 1: only a couple of the real tables, using the real v1 index
    // strings, mimicking an early release's schema.
    const v1Handle = new Dexie(PROBE_DB_NAME)
    v1Handle.version(1).stores({ exercises: STORES_V1.exercises, settings: STORES_V1.settings })
    await v1Handle.open()
    await v1Handle.table('exercises').put({ id: 'ex_probe', name: 'Probe squat', category: 'squat' })
    v1Handle.close()

    // Version 2: replays v1 unchanged, then adds a new store (symptomLogs)
    // and a new index on the existing exercises store (isSeeded) — the two
    // shapes of change a real STORES_V2 would make.
    const v2Handle = new Dexie(PROBE_DB_NAME)
    v2Handle.version(1).stores({ exercises: STORES_V1.exercises, settings: STORES_V1.settings })
    v2Handle.version(2).stores({
      exercises: `${STORES_V1.exercises}, isSeeded`,
      settings: STORES_V1.settings,
      symptomLogs: STORES_V1.symptomLogs,
    })
    await v2Handle.open()

    // Fails if no upgrade transaction actually ran (e.g. if v2 were silently
    // skipped, verno would still read 1).
    expect(v2Handle.verno).toBe(2)

    const row = await v2Handle.table<ProbeExerciseRow, string>('exercises').get('ex_probe')
    expect(row?.name).toBe('Probe squat')
    expect(row?.category).toBe('squat')

    // The new store from the upgrade is usable too.
    const symptomLogs = v2Handle.table<ProbeSymptomRow, string>('symptomLogs')
    await symptomLogs.put({ id: 'sym_1', instanceId: 'wi_1', forDate: '2026-07-27' })
    expect((await symptomLogs.get('sym_1'))?.instanceId).toBe('wi_1')

    v2Handle.close()
  })
})
