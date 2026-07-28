import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import { getProfile } from '../profileRepo'
import { getActiveGoal, setRaceGoal } from '../goalRepo'
import { getSettings } from '../settingsRepo'
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
})

describe('settingsRepo', () => {
  it('getSettings creates the default row if absent', async () => {
    expect(await db.settings.count()).toBe(0)
    const settings = await getSettings()
    expect(settings.id).toBe('app')
    expect(await db.settings.count()).toBe(1)
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
