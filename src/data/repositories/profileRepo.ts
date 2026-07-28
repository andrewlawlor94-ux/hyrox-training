import { db } from '@/data/db'
import type { AthleteProfile, ISOInstant } from '@/data/types'

const PROFILE_ID = 'me'

/**
 * This is a public repository. The singleton profile row is created with
 * every athlete-specific field left unset — no age, height, weight, body
 * fat, training background, or considerations text is ever seeded here. The
 * athlete supplies these during onboarding via `updateProfile`, and they
 * live only in the local IndexedDB instance on their own device.
 *
 * Deviation from the task-16 brief's literal signature: the brief lists
 * `getProfile(): Promise<AthleteProfile>` with no clock parameter, but the
 * brief's own architectural rule ("every repository function takes
 * `now`/`today` as a parameter") is stated as one of the three properties
 * that matter most, and `AthleteProfile.updatedAt` is a required
 * `ISOInstant` that must come from somewhere on first creation. Adding `now`
 * here (and to `updateProfile`) follows that rule rather than the
 * signature list; see the Task 16 report.
 */
export async function getProfile(now: ISOInstant): Promise<AthleteProfile> {
  const existing = await db.athleteProfile.get(PROFILE_ID)
  if (existing) return existing
  const row: AthleteProfile = { id: PROFILE_ID, updatedAt: now }
  await db.athleteProfile.add(row)
  return row
}

export async function updateProfile(patch: Partial<AthleteProfile>, now: ISOInstant): Promise<void> {
  const current = await getProfile(now)
  await db.athleteProfile.put({ ...current, ...patch, id: PROFILE_ID, updatedAt: now })
}
