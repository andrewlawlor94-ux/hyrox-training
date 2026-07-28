import { describe, expect, it } from 'vitest'
import { SEED_HYROX_STANDARDS } from '../hyroxStandards'

describe('HYROX Men\'s Open standards seed', () => {
  it('covers all eight stations in race order', () => {
    expect(SEED_HYROX_STANDARDS.map((s) => s.station)).toEqual([
      'skiErg', 'sledPush', 'sledPull', 'burpeeBroadJump',
      'row', 'farmerCarry', 'sandbagLunge', 'wallBalls',
    ])
  })

  it.each([
    ['skiErg', { distanceM: 1000 }],
    ['sledPush', { distanceM: 50, loadKg: 152 }],
    ['sledPull', { distanceM: 50, loadKg: 103 }],
    ['burpeeBroadJump', { distanceM: 80 }],
    ['row', { distanceM: 1000 }],
    ['farmerCarry', { distanceM: 200, loadPerHandKg: 24 }],
    ['sandbagLunge', { distanceM: 100, loadKg: 20 }],
    ['wallBalls', { reps: 100, ballKg: 6, targetHeightM: 3.0 }],
  ])('seeds %s correctly', (station, expected) => {
    const s = SEED_HYROX_STANDARDS.find((x) => x.station === station)
    expect(s).toMatchObject(expected)
  })

  it('marks every standard as seeded so it can be restored', () => {
    expect(SEED_HYROX_STANDARDS.every((s) => s.isSeeded)).toBe(true)
  })

  it('is editable configuration, not frozen constants', () => {
    // Every standard must carry an id so the user can persist an edited copy.
    expect(SEED_HYROX_STANDARDS.every((s) => typeof s.id === 'string' && s.id.length > 0)).toBe(true)
  })

  it('notes the overhead clearance requirement on wall balls', () => {
    const wb = SEED_HYROX_STANDARDS.find((s) => s.station === 'wallBalls')
    expect(wb?.notes).toMatch(/overhead clearance/i)
  })

  it('notes that sled friction varies between venues', () => {
    const push = SEED_HYROX_STANDARDS.find((s) => s.station === 'sledPush')
    expect(push?.notes).toMatch(/friction/i)
  })

  it('uses unique ids', () => {
    expect(new Set(SEED_HYROX_STANDARDS.map((s) => s.id)).size).toBe(SEED_HYROX_STANDARDS.length)
  })
})
