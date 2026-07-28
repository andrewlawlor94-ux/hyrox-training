import { db } from '@/data/db'
import type { AthleteProfile, ISOInstant } from '@/data/types'

const PROFILE_ID = 'me'

/**
 * This is a public repository. The singleton profile row is created with
 * every athlete-specific field left unset — no age, height, weight, body
 * fat, training background, or considerations text is ever seeded here. The
 * athlete supplies these during onboarding via `updateProfile`, and they
 * live only in the local IndexedDB instance on their own device.
 */

/**
 * Pure read: the profile row, or `undefined` if the athlete hasn't been
 * onboarded yet. Never writes — safe to call from inside a Dexie
 * `liveQuery`, unlike `ensureProfile`/`getProfile` (which persist a row on
 * first read and would throw a `DexieError` if a live query's read-only
 * transaction context ever tried to). Returns `undefined` rather than a
 * fabricated default row so this never needs a `now` it has no honest
 * source for — a would-be `useProfile` hook can't read the clock itself
 * any more than any other component can.
 */
export async function readProfile(): Promise<AthleteProfile | undefined> {
  return db.athleteProfile.get(PROFILE_ID)
}

/** Persists the empty profile row if (and only if) it doesn't already
 * exist, and returns it either way. Call outside any live query — `now`
 * stamps `updatedAt` on first creation. */
export async function ensureProfile(now: ISOInstant): Promise<AthleteProfile> {
  const existing = await db.athleteProfile.get(PROFILE_ID)
  if (existing) return existing
  const row: AthleteProfile = { id: PROFILE_ID, updatedAt: now }
  await db.athleteProfile.add(row)
  return row
}

/**
 * Alias kept for write-path call sites (`updateProfile`, onboarding's
 * finish sequence) that need the row to exist — functionally identical to
 * `ensureProfile`. Never call this from inside a `liveQuery` callback.
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
  return ensureProfile(now)
}

export async function updateProfile(patch: Partial<AthleteProfile>, now: ISOInstant): Promise<void> {
  const current = await ensureProfile(now)
  await db.athleteProfile.put({ ...current, ...patch, id: PROFILE_ID, updatedAt: now })
}
