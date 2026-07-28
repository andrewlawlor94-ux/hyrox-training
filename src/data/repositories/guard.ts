import type { WorkoutInstance } from '@/data/types'
import { HistoryImmutableError } from '../errors'

/**
 * Chokepoint every repository write to a `WorkoutInstance` (or its logged
 * children) must pass through. Once `frozen` is true the instance represents
 * completed training history; writing to it silently would lose or corrupt
 * that history, so this throws rather than swallowing the write. Pass
 * `{ allowHistoryEdit: true }` only from the one deliberate "edit past
 * session" path, never as a default.
 */
export function assertMutable(
  instance: Pick<WorkoutInstance, 'id' | 'frozen'>,
  opts?: { allowHistoryEdit?: boolean },
): void {
  if (instance.frozen && !opts?.allowHistoryEdit) {
    throw new HistoryImmutableError('WorkoutInstance', instance.id)
  }
}
