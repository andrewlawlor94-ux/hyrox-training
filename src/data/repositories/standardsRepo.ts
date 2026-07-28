import { db } from '@/data/db'
import type { HyroxStandard } from '@/data/types'

/**
 * The task-16 brief lists `standardsRepo.ts` among the files to create but
 * gives no consumer signature for it (unlike every other repository) — no
 * later task's call site is documented. `HyroxStandard` is described as
 * "editable" (see `@/data/types/exercise.ts`), so this repository exposes
 * the minimal read/edit pair a settings screen would need; nothing else in
 * this task depends on it.
 */
export async function listStandards(): Promise<HyroxStandard[]> {
  return db.hyroxStandards.orderBy('order').toArray()
}

export async function updateStandard(id: string, patch: Partial<HyroxStandard>): Promise<void> {
  const current = await db.hyroxStandards.get(id)
  if (!current) throw new Error(`No HyroxStandard "${id}"`)
  await db.hyroxStandards.put({ ...current, ...patch, id })
}
