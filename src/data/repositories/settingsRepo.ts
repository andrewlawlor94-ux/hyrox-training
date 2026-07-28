import { db, SCHEMA_VERSION } from '@/data/db'
import type { AppSettings } from '@/data/types'

const SETTINGS_ID = 'app'

/** The row created the first time `getSettings` runs on a fresh database.
 * Carries no personal data — every athlete-specific value lives on
 * `AthleteProfile`/`RaceGoal`, seeded separately (and never with real
 * values; see `profileRepo.ts`). `activePlanId` starts empty because no
 * plan exists yet on a fresh install. */
function defaultSettings(): AppSettings {
  return {
    id: SETTINGS_ID,
    schemaVersion: SCHEMA_VERSION,
    activePlanId: '',
    strengthUnit: 'lb',
    stationUnit: 'lb',
    restSoundEnabled: true,
    restVibrationEnabled: true,
    dismissedSubstitutions: [],
  }
}

/** Reads the singleton settings row, creating it with defaults on first call. */
export async function getSettings(): Promise<AppSettings> {
  const existing = await db.settings.get(SETTINGS_ID)
  if (existing) return existing
  const row = defaultSettings()
  await db.settings.add(row)
  return row
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: SETTINGS_ID })
}
