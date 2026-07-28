import { db } from '@/data/db'
import type { ISODate, ISOInstant, RaceGoal } from '@/data/types'
import { appendEvent } from './scheduleRepo'
import { newId } from './ids'

export async function getActiveGoal(): Promise<RaceGoal | undefined> {
  return db.raceGoals.filter((g) => g.isActive).first()
}

/**
 * Deactivates every currently-active goal (kept, never deleted — the
 * athlete's race history survives) and installs a new one, then appends a
 * `RACE_DATE_CHANGE` event so the next `syncQueue` call re-derives the
 * schedule against the new race date. `division` is not part of this
 * function's input contract (the task-16 brief's signature has no such
 * field even though `RaceGoal.division` is required); it carries forward
 * from the previous active goal, defaulting to `''` when there was none.
 */
export async function setRaceGoal(
  input: { raceDate: ISODate; targetSeconds: number; stretchSeconds: number },
  now: ISOInstant,
): Promise<RaceGoal> {
  return db.transaction('rw', db.raceGoals, db.scheduleEvents, async () => {
    const previous = await db.raceGoals.filter((g) => g.isActive).toArray()
    for (const goal of previous) {
      await db.raceGoals.put({ ...goal, isActive: false })
    }

    const goal: RaceGoal = {
      id: newId('goal'),
      raceDate: input.raceDate,
      targetSeconds: input.targetSeconds,
      stretchSeconds: input.stretchSeconds,
      division: previous[0]?.division ?? '',
      isActive: true,
      createdAt: now,
    }
    await db.raceGoals.add(goal)
    await appendEvent({ at: now, type: 'RACE_DATE_CHANGE', payload: { raceDate: input.raceDate } })
    return goal
  })
}
