import { db, SCHEMA_VERSION } from '@/data/db'
import type { AppSettings } from '@/data/types'

const SETTINGS_ID = 'app'

/** The row created the first time `ensureSettings` runs on a fresh database.
 * Carries no personal data — every athlete-specific value lives on
 * `AthleteProfile`/`RaceGoal`, seeded separately (and never with real
 * values; see `profileRepo.ts`). `activePlanId` starts empty because no
 * plan exists yet on a fresh install.
 *
 * `restSoundEnabled`/`restVibrationEnabled` default `false` (spec: both are
 * off until the athlete opts in via Settings) and `stationUnit` defaults
 * `'kg'` (HYROX station loads are metric by competition standard — every
 * seeded station `Exercise.defaultUnit` is `'kg'` too; a `'lb'` default here
 * would contradict the seeded data the moment the station UI reads it). */
function defaultSettings(): AppSettings {
  return {
    id: SETTINGS_ID,
    schemaVersion: SCHEMA_VERSION,
    activePlanId: '',
    strengthUnit: 'lb',
    stationUnit: 'kg',
    restSoundEnabled: false,
    restVibrationEnabled: false,
    dismissedSubstitutions: [],
  }
}

/**
 * Pure read: the singleton settings row, or an in-memory default when it
 * doesn't exist yet. Never writes — this is the ONLY settings read safe to
 * call from inside a Dexie `liveQuery` (used by `useSettings`). Dexie runs
 * a live query's callback in a read-only transaction context and throws a
 * `DexieError` on any write attempted inside it; on a genuinely fresh
 * database (the real first-run path) `ensureSettings`'s old combined
 * read-or-create behaviour hit exactly that branch and crashed boot with a
 * blank page, because `useSettings` called it as its live query source.
 */
export async function readSettings(): Promise<AppSettings> {
  const existing = await db.settings.get(SETTINGS_ID)
  return existing ?? defaultSettings()
}

/** Persists the default settings row if (and only if) it doesn't already
 * exist, and returns it either way. Called once from `BootGate`, alongside
 * `seedIfEmpty` and outside any live query, so every later read — including
 * every `readSettings` call inside `useSettings`'s live query — finds a row
 * already there rather than needing to write one. */
export async function ensureSettings(): Promise<AppSettings> {
  const existing = await db.settings.get(SETTINGS_ID)
  if (existing) return existing
  const row = defaultSettings()
  await db.settings.add(row)
  return row
}

/** Alias kept for write-path call sites (`updateSettings`, `syncQueue`,
 * `getTodaysWorkout`, `setActivePlan`, ...) that need the row to exist so
 * they can read-modify-write it — functionally identical to
 * `ensureSettings`. Never call this from inside a `liveQuery` callback; use
 * `readSettings` there instead. */
export async function getSettings(): Promise<AppSettings> {
  return ensureSettings()
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await ensureSettings()
  await db.settings.put({ ...current, ...patch, id: SETTINGS_ID })
}
