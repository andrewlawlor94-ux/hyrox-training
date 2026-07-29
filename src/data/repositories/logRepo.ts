import { db } from '@/data/db'
import type { IntervalSplit, RunLog, StationLog, SymptomLog, WorkoutInstance } from '@/data/types'
import { assertMutable } from './guard'

async function assertMutableFor(instanceId: string): Promise<WorkoutInstance> {
  const instance = await db.workoutInstances.get(instanceId)
  if (!instance) throw new Error(`No WorkoutInstance "${instanceId}"`)
  assertMutable(instance)
  return instance
}

/** `RunLog.instanceId` is required, so every run log always has an owning
 * instance to guard against. */
export async function saveRunLog(log: RunLog, splits: IntervalSplit[]): Promise<void> {
  await assertMutableFor(log.instanceId)
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
export async function saveStationLog(log: StationLog): Promise<void> {
  await assertMutableFor(log.instanceId)
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
