import type { HyroxDb } from '@/data/db'
import type { ISOInstant } from '@/data/types'
import { SEED_EXERCISES } from './exercises'
import { SEED_HYROX_STANDARDS } from './hyroxStandards'

/**
 * Seeds the exercise library and HYROX standards on first boot, and never
 * again touches either table once it holds any rows. Called on every app
 * boot, so the no-clobber guarantee matters: each table's `count()` check
 * and its `bulkPut` happen inside one Dexie read-write transaction, and a
 * table is only written when its own count is exactly zero. That means:
 * - A never-seeded table gets every seed row inserted.
 * - A previously seeded (or user-populated) table is left completely alone,
 *   including rows the athlete has edited or deleted -- `bulkPut` is only
 *   ever reached when the table is empty, so it can never overwrite or
 *   resurrect a row.
 * - The two tables are independent: seeding one does not depend on, or
 *   wait for, the other being empty too.
 *
 * `now` stamps `createdAt`/`updatedAt` on the inserted exercise rows, since
 * the static `SEED_EXERCISES` literals carry only a type-satisfying
 * placeholder timestamp, not the real moment they were written to disk.
 */
export async function seedIfEmpty(
  db: HyroxDb,
  now: ISOInstant,
): Promise<{ exercises: number; standards: number }> {
  return db.transaction('rw', db.exercises, db.hyroxStandards, async () => {
    let exercises = 0
    let standards = 0

    if ((await db.exercises.count()) === 0) {
      const rows = SEED_EXERCISES.map((exercise) => ({ ...exercise, createdAt: now, updatedAt: now }))
      await db.exercises.bulkPut(rows)
      exercises = rows.length
    }

    if ((await db.hyroxStandards.count()) === 0) {
      await db.hyroxStandards.bulkPut([...SEED_HYROX_STANDARDS])
      standards = SEED_HYROX_STANDARDS.length
    }

    return { exercises, standards }
  })
}
