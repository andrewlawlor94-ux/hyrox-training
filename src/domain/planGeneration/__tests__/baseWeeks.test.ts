import { describe, expect, it } from 'vitest'
import { generateBaseWeeks } from '../baseWeeks'

describe('generateBaseWeeks', () => {
  it('generates no weeks when none are needed', () => {
    expect(generateBaseWeeks(0)).toEqual([])
  })

  it('generates the requested number of weeks', () => {
    expect(generateBaseWeeks(6)).toHaveLength(6)
  })

  it('numbers weeks from one', () => {
    expect(generateBaseWeeks(3).map((w) => w.weekNumber)).toEqual([1, 2, 3])
  })

  it('labels weeks as base weeks', () => {
    expect(generateBaseWeeks(2).every((w) => w.label.toLowerCase().includes('base'))).toBe(true)
  })

  it('gives every base week at least the minimum effective four sessions', () => {
    expect(generateBaseWeeks(4).every((w) => w.templates.length >= 4)).toBe(true)
  })

  it('never exceeds six sessions in a base week', () => {
    expect(generateBaseWeeks(4).every((w) => w.templates.length <= 6)).toBe(true)
  })

  it('includes an easy run, a Zone 2 session, and strength maintenance', () => {
    const week = generateBaseWeeks(1)[0]
    if (!week) throw new Error('no week')
    const tags = week.templates.flatMap((t) => t.recoveryTags)
    expect(tags).toContain('easyRun')
    expect(tags).toContain('lowImpactAerobic')
    expect(tags).toContain('lowerBodyStrength')
  })

  it('marks Zone 2 as optional so it drops first under pressure', () => {
    const week = generateBaseWeeks(1)[0]
    if (!week) throw new Error('no week')
    const zone2 = week.templates.find((t) => t.recoveryTags.includes('lowImpactAerobic'))
    expect(zone2?.priority).toBe('optional')
  })

  it('schedules no hard running in base weeks because the athlete is building durability', () => {
    const tags = generateBaseWeeks(8).flatMap((w) => w.templates.flatMap((t) => t.recoveryTags))
    expect(tags).not.toContain('hardRun')
  })

  it('progresses easy run duration across the base block', () => {
    const weeks = generateBaseWeeks(6)
    const durations = weeks.map((w) => {
      const run = w.templates.find((t) => t.recoveryTags.includes('easyRun'))
      return run?.estMinutes ?? 0
    })
    expect(durations[durations.length - 1]!).toBeGreaterThan(durations[0]!)
  })

  it('produces unique template ids across all weeks', () => {
    const ids = generateBaseWeeks(8).flatMap((w) => w.templates.map((t) => t.templateId))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is deterministic', () => {
    expect(generateBaseWeeks(5)).toEqual(generateBaseWeeks(5))
  })
})
