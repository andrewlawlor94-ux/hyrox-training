/** Total row count across every table in a backup's `counts` map (or the
 * device's current per-table counts) — the single number the C1 confirmation
 * shows the athlete alongside the file's own total. */
export function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0)
}

/**
 * Below this fraction of the device's current total, a file is treated as a
 * likely mistake (wrong file, stale export, or a backup taken right after a
 * reset) rather than a deliberate restore of an older-but-still-substantial
 * backup (C3). Training history in this app only accumulates over a 24-week
 * plan — a genuine backup taken days or weeks apart loses some recent
 * sessions, not the majority of everything ever logged. One half is
 * deliberately the midpoint of that range: losing more than half of today's
 * records in one import is decisively outside "slightly stale", so it earns
 * a harder confirmation than a normal restore, while a backup that is merely
 * missing the last few sessions does not.
 */
export const DRASTIC_SHRINK_RATIO = 0.5

/**
 * True when importing `fileTotal` records over `currentTotal` records would
 * discard the vast majority (or all) of what is already on this device.
 * Always false when the device is already empty — there is nothing to lose,
 * so even a completely empty file is not "data loss". Always true when the
 * device has data but the file has none at all, regardless of the ratio.
 */
export function isDrasticDataLoss(currentTotal: number, fileTotal: number): boolean {
  if (currentTotal === 0) return false
  if (fileTotal === 0) return true
  return fileTotal < currentTotal * DRASTIC_SHRINK_RATIO
}
