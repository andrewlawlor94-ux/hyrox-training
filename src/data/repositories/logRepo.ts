import { db } from '@/data/db'
import type { IntervalSplit, RunLog, StationLog, SymptomLog, WorkoutInstance } from '@/data/types'
import { assertMutable } from './guard'

/** Opt-in escape hatch for the "edit this past record" path only. Named rather
 * than inlined so every function carrying it is greppable. */
export interface HistoryEditOpts { allowHistoryEdit?: boolean }

/** `opts` is threaded straight through to `assertMutable`, so the one
 * deliberate "correct a past record" path can pass `{ allowHistoryEdit: true }`
 * exactly the way `upsertSet` already does. Every other caller omits it and
 * frozen history stays untouchable. */
async function assertMutableFor(instanceId: string, opts?: HistoryEditOpts): Promise<WorkoutInstance> {
  const instance = await db.workoutInstances.get(instanceId)
  if (!instance) throw new Error(`No WorkoutInstance "${instanceId}"`)
  assertMutable(instance, opts)
  return instance
}

/** `RunLog.instanceId` is required, so every run log always has an owning
 * instance to guard against. */
export async function saveRunLog(log: RunLog, splits: IntervalSplit[], opts?: HistoryEditOpts): Promise<void> {
  await assertMutableFor(log.instanceId, opts)
  await db.transaction('rw', db.runLogs, db.intervalSplits, async () => {
    await db.runLogs.put(log)
    await db.intervalSplits.bulkPut(splits)
  })
}

/**
 * Removes a run log and its interval splits entirely, rather than leaving a
 * stale `distanceKm`/`durationSec` behind. `RunLog` requires both fields as
 * numbers (unlike `StationLog`, where every measurement is optional), so
 * once the athlete clears a required field there is no valid partial row to
 * write — the only representation of "no longer a complete, asserted run"
 * is no row at all. Called by `RunBlock` in place of the save it would
 * otherwise schedule whenever the merged distance/duration stop being a
 * genuinely loggable run (I3). A no-op if `runLogId` was never saved.
 */
export async function deleteRunLog(runLogId: string, instanceId: string): Promise<void> {
  await assertMutableFor(instanceId)
  await db.transaction('rw', db.runLogs, db.intervalSplits, async () => {
    await db.intervalSplits.where('runLogId').equals(runLogId).delete()
    await db.runLogs.delete(runLogId)
  })
}

/** `StationLog.instanceId` is required, so every station log always has an
 * owning instance to guard against. */
export async function saveStationLog(log: StationLog, opts?: HistoryEditOpts): Promise<void> {
  await assertMutableFor(log.instanceId, opts)
  await db.stationLogs.put(log)
}

/** `SymptomLog.instanceId` is optional — a daily symptom check can stand
 * alone, unattached to any workout — so the guard only runs when one is
 * present. */
export async function saveSymptomLog(log: SymptomLog): Promise<void> {
  if (log.instanceId !== undefined) await assertMutableFor(log.instanceId)
  await db.symptomLogs.put(log)
}

export async function listSymptomLogs(): Promise<SymptomLog[]> {
  const logs = await db.symptomLogs.toArray()
  return logs.sort((a, b) => (a.forDate < b.forDate ? -1 : a.forDate > b.forDate ? 1 : 0))
}
