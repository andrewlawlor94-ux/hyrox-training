import Dexie, { type Table } from 'dexie'
import type {
  AppSettings, AthleteProfile, Exercise, HyroxStandard, InstancePrescription, IntervalSplit,
  MilestoneRecord, Plan, PlanPhase, PlanWeek, Prescription, QueueExplanation, RaceGoal,
  RestTimerState, RunLog, SafetyBackup, ScheduleEvent, ScheduleOverride, StationLog,
  StrengthSet, SymptomLog, WorkoutInstance, WorkoutTemplate,
} from '@/data/types'
import { classifyDbError, DbUnavailableError } from './errors'
import { MIGRATIONS } from './migrations'

export { SCHEMA_VERSION } from './schema'

/** The single IndexedDB database name for the whole app. Never rename —
 * doing so would orphan every athlete's existing data. */
const DB_NAME = 'hyrox-training'

/**
 * The app's single Dexie handle. One typed `Table<T, string>` property per
 * entity — `string` is the primary-key type (every table keys on the
 * entity's own `id`). The schema itself is applied by replaying `MIGRATIONS`
 * in order, so this class never hardcodes index strings directly.
 */
export class HyroxDb extends Dexie {
  exercises!: Table<Exercise, string>
  workoutInstances!: Table<WorkoutInstance, string>
  instancePrescriptions!: Table<InstancePrescription, string>
  strengthSets!: Table<StrengthSet, string>
  runLogs!: Table<RunLog, string>
  intervalSplits!: Table<IntervalSplit, string>
  stationLogs!: Table<StationLog, string>
  symptomLogs!: Table<SymptomLog, string>
  scheduleEvents!: Table<ScheduleEvent, string>
  scheduleOverrides!: Table<ScheduleOverride, string>
  queueExplanations!: Table<QueueExplanation, string>
  prescriptions!: Table<Prescription, string>
  workoutTemplates!: Table<WorkoutTemplate, string>
  planWeeks!: Table<PlanWeek, string>
  planPhases!: Table<PlanPhase, string>
  plans!: Table<Plan, string>
  raceGoals!: Table<RaceGoal, string>
  hyroxStandards!: Table<HyroxStandard, string>
  milestoneState!: Table<MilestoneRecord, string>
  settings!: Table<AppSettings, string>
  athleteProfile!: Table<AthleteProfile, string>
  restTimerState!: Table<RestTimerState, string>
  safetyBackups!: Table<SafetyBackup, string>

  constructor() {
    super(DB_NAME)
    for (const migration of MIGRATIONS) {
      this.version(migration.version).stores(migration.stores)
    }
  }
}

export const db = new HyroxDb()

/**
 * Opens `db`, classifying and rethrowing any failure as a `DbUnavailableError`
 * so callers (and ultimately the UI) get a specific, actionable reason
 * instead of a raw DOMException. Idempotent: Dexie's own `open()` returns the
 * existing ready-promise when already open or opening, so calling this twice
 * resolves both times rather than erroring.
 */
export async function openDb(): Promise<HyroxDb> {
  try {
    await db.open()
    return db
  } catch (err) {
    throw new DbUnavailableError(classifyDbError(err), err)
  }
}

/**
 * Deletes and recreates the database. Used only by the Settings "reset"
 * action and by tests that need a clean slate between cases — never by
 * normal app startup or write paths.
 */
export async function resetDatabase(): Promise<void> {
  if (db.isOpen()) db.close()
  await db.delete()
  await openDb()
}

/**
 * Best-effort raw dump of every object store, read directly through the
 * native `indexedDB` API rather than Dexie — used by `DbErrorScreen`'s
 * "Export what we can" affordance when `openDb()` itself has already
 * failed, so Dexie's own schema/version negotiation (which is exactly what
 * may be broken) is never back on the critical path. Opens with no version
 * argument, which never triggers an upgrade, and reads whatever stores
 * already exist at whatever version the browser currently has on disk.
 */
export async function exportRawSnapshot(): Promise<Record<string, unknown[]>> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME)
    request.onerror = () => { reject(request.error ?? new Error('Unable to open database for export')) }
    request.onsuccess = () => {
      const rawDb = request.result
      const storeNames = Array.from(rawDb.objectStoreNames)
      if (storeNames.length === 0) {
        rawDb.close()
        resolve({})
        return
      }

      const dump: Record<string, unknown[]> = {}
      const tx = rawDb.transaction(storeNames, 'readonly')
      let remaining = storeNames.length

      for (const name of storeNames) {
        const getAllRequest = tx.objectStore(name).getAll()
        getAllRequest.onsuccess = () => {
          dump[name] = getAllRequest.result as unknown[]
          remaining -= 1
          if (remaining === 0) {
            rawDb.close()
            resolve(dump)
          }
        }
        getAllRequest.onerror = () => {
          rawDb.close()
          reject(getAllRequest.error ?? new Error(`Unable to read store "${name}"`))
        }
      }
    }
  })
}
