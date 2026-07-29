import { describe, expect, it } from 'vitest'
import { generateBaseWeeks } from '@/domain/planGeneration/baseWeeks'
import { SEED_EXERCISES } from '@/data/seed/exercises'
import { buildBaseWeekPrescriptions } from '..'

const VALID_EXERCISE_IDS = new Set<string>(SEED_EXERCISES.map((e) => e.id))

/**
 * Permanent regression cover for the defect that shipped a plan whose first
 * three weeks -- including the athlete's very first session -- contained no
 * exercises at all. `generateBaseWeeks` (pure domain, cannot see exercise ids)
 * produces scheduling metadata only, and nothing asserted that the seed layer
 * actually supplied content for every slot it emits.
 *
 * These assertions are deliberately shaped to fail on ABSENCE: an empty
 * prescription array, or a slot the switch does not handle, is caught here
 * rather than passing vacuously the way a "every prescription is valid" check
 * over a flattened list would.
 */
describe('buildBaseWeekPrescriptions', () => {
  const templates = generateBaseWeeks(6).flatMap((week) => week.templates)

  it('covers every slot generateBaseWeeks can emit, with no unhandled slot', () => {
    expect(templates.length).toBeGreaterThan(0)
    for (const template of templates) {
      expect(() => buildBaseWeekPrescriptions(template), `slot ${String(template.sessionSlot)} ("${template.name}")`).not.toThrow()
    }
  })

  it('prescribes at least one exercise for every Base-week session', () => {
    const empty = templates
      .filter((t) => buildBaseWeekPrescriptions(t).length === 0)
      .map((t) => `w${String(t.weekNumber)}s${String(t.sessionSlot)} "${t.name}"`)
    expect(empty).toEqual([])
  })

  it('references only seeded exercise ids, with a positive restSec on each', () => {
    for (const template of templates) {
      for (const prescription of buildBaseWeekPrescriptions(template)) {
        expect(VALID_EXERCISE_IDS.has(prescription.exerciseId), `unknown exercise "${prescription.exerciseId}"`).toBe(true)
        expect(prescription.restSec).toBeGreaterThan(0)
      }
    }
  })

  it('throws on a slot it does not know, rather than silently returning nothing', () => {
    const first = templates[0]
    if (!first) throw new Error('generateBaseWeeks produced no templates')
    expect(() => buildBaseWeekPrescriptions({ ...first, sessionSlot: 99 })).toThrow(/session slot/)
  })
})
