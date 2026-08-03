import type { HyroxDb } from '@/data/db'
import type { ISOInstant } from '@/data/types'
import { SEED_EXERCISES } from './exercises'
import { SEED_EXERCISE_RENAMES } from './exerciseRenames'
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

/**
 * Applies `SEED_EXERCISE_RENAMES` to a database that was seeded before a seeded
 * exercise was renamed.
 *
 * Separate from `seedIfEmpty` because that function's whole contract is "never
 * touch a table that already has rows" — which is right for content, and exactly
 * why a rename cannot ride along with it. This writes at most one field, on at
 * most the listed rows, and only while they still carry the previously shipped
 * name (see `SeedExerciseRename.from`).
 *
 * Returns the ids it actually renamed, so a caller can log or test the effect
 * rather than inferring it.
 */
export async function reconcileSeededNames(db: HyroxDb, now: ISOInstant): Promise<string[]> {
  return db.transaction('rw', db.exercises, async () => {
    const renamed: string[] = []
    for (const rename of SEED_EXERCISE_RENAMES) {
      const existing = await db.exercises.get(rename.id)
      // Absent (never seeded), already renamed, or renamed by the athlete to
      // something of their own — all three are left alone.
      if (!existing || existing.name !== rename.from) continue
      await db.exercises.put({ ...existing, name: rename.to, updatedAt: now })
      renamed.push(rename.id)
    }
    return renamed
  })
}
