import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { readSettings } from '@/data/repositories'
import type { ISODate, QueueExplanation, WorkoutInstance } from '@/data/types'

export interface QueueState {
  instances: WorkoutInstance[]
  explanations: QueueExplanation[]
}

/**
 * Reactive read of the active plan's `WorkoutInstance` rows and the queue
 * engine's latest `QueueExplanation` rows. Re-runs on any write to either
 * table (or to settings, since the active plan can change) AND whenever
 * `today` itself changes — `today` is only ever meant to arrive from
 * `useToday`, never read here directly, keeping this hook itself clock-free.
 * Returns `undefined` while the first read is still resolving.
 *
 * Uses `readSettings` (pure), never `getSettings`/`ensureSettings` — this
 * callback runs inside `useLiveQuery`'s read-only transaction context,
 * which throws on any write. On a fresh database `readSettings` falls back
 * to an in-memory default with `activePlanId: ''`, which simply matches no
 * instances — correct, since no plan exists before onboarding.
 */
export function useQueue(today: ISODate): QueueState | undefined {
  return useLiveQuery(async (): Promise<QueueState> => {
    const settings = await readSettings()
    const [instances, explanations] = await Promise.all([
      db.workoutInstances.where('planId').equals(settings.activePlanId).toArray(),
      db.queueExplanations.toArray(),
    ])
    return { instances, explanations }
  }, [today])
}
