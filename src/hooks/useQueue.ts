import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { getSettings } from '@/data/repositories'
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
 */
export function useQueue(today: ISODate): QueueState | undefined {
  return useLiveQuery(async (): Promise<QueueState> => {
    const settings = await getSettings()
    const [instances, explanations] = await Promise.all([
      db.workoutInstances.where('planId').equals(settings.activePlanId).toArray(),
      db.queueExplanations.toArray(),
    ])
    return { instances, explanations }
  }, [today])
}
