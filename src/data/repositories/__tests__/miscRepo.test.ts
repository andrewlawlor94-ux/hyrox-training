import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import { ensureProfile, getProfile, readProfile } from '../profileRepo'
import { getActiveGoal, setRaceGoal } from '../goalRepo'
import { ensureSettings, getSettings, readSettings } from '../settingsRepo'
import { listEvents } from '../scheduleRepo'

const NOW = '2026-07-27T10:00:00.000Z'

beforeEach(async () => { await resetDatabase() })

describe('profileRepo', () => {
  it('getProfile seeds no personal values on first read', async () => {
    const profile = await getProfile(NOW)
    expect(profile.age).toBeUndefined()
    expect(profile.heightIn).toBeUndefined()
    expect(profile.weightLb).toBeUndefined()
    expect(profile.bodyFatPct).toBeUndefined()
    expect(profile.trainingBackground).toBeUndefined()
    expect(profile.considerations).toBeUndefined()
  })

  it('getProfile creates exactly one row on repeated calls', async () => {
    await getProfile(NOW)
    await getProfile('2026-07-27T11:00:00.000Z')
    expect(await db.athleteProfile.count()).toBe(1)
  })

  it('readProfile never writes: returns undefined on an empty table and leaves it empty', async () => {
    expect(await readProfile()).toBeUndefined()
    expect(await db.athleteProfile.count()).toBe(0)
  })

  it('ensureProfile persists the row exactly once; readProfile then sees it without writing again', async () => {
    const created = await ensureProfile(NOW)
    expect(await db.athleteProfile.count()).toBe(1)

    const readBack = await readProfile()
    expect(readBack).toEqual(created)
    expect(await db.athleteProfile.count()).toBe(1)

    await ensureProfile('2026-07-27T11:00:00.000Z')
    expect(await db.athleteProfile.count()).toBe(1)
  })
})

describe('settingsRepo', () => {
  it('getSettings creates the default row if absent', async () => {
    expect(await db.settings.count()).toBe(0)
    const settings = await getSettings()
    expect(settings.id).toBe('app')
    expect(await db.settings.count()).toBe(1)
  })

  it('readSettings never writes: returns an in-memory default on an empty table and leaves it empty', async () => {
    const settings = await readSettings()
    expect(settings.id).toBe('app')
    expect(await db.settings.count()).toBe(0)
  })

  it('ensureSettings persists the row exactly once; readSettings then sees the same row without writing again', async () => {
    const created = await ensureSettings()
    expect(await db.settings.count()).toBe(1)

    const readBack = await readSettings()
    expect(readBack).toEqual(created)
    expect(await db.settings.count()).toBe(1)

    await ensureSettings()
    expect(await db.settings.count()).toBe(1)
  })

  it('pins the spec-mandated defaults: rest sound/vibration off, station unit metric', async () => {
    const settings = await ensureSettings()
    expect(settings.restSoundEnabled).toBe(false)
    expect(settings.restVibrationEnabled).toBe(false)
    expect(settings.stationUnit).toBe('kg')
  })
})

describe('goalRepo', () => {
  it('setRaceGoal deactivates the previous goal rather than deleting it, and appends a RACE_DATE_CHANGE event', async () => {
    const first = await setRaceGoal({ raceDate: '2026-12-01', targetSeconds: 5400, stretchSeconds: 5100 }, NOW)
    const second = await setRaceGoal({ raceDate: '2027-01-15', targetSeconds: 5300, stretchSeconds: 5000 }, '2026-08-01T00:00:00.000Z')

    const firstRow = await db.raceGoals.get(first.id)
    expect(firstRow).toBeDefined()
    expect(firstRow?.isActive).toBe(false)

    expect((await getActiveGoal())?.id).toBe(second.id)
    expect(await db.raceGoals.count()).toBe(2)

    const events = await listEvents()
    expect(events.filter((e) => e.type === 'RACE_DATE_CHANGE')).toHaveLength(2)
  })
})
