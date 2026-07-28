import { describe, expect, it } from 'vitest'
import { SEED_WEEKS_24 } from '../index'

/**
 * The expected essential/important/optional slot layout per week, per D7.
 * This is this implementation's own documented ruling on §19's per-phase
 * essential list (the source brief's literal list is not available in this
 * repo -- see the Task 15 report). Slot 3 (Zone 2) is always optional when
 * present. Reduced-to-minimum (four-template) weeks have no important/
 * optional slot at all: every present session is essential (D5).
 *
 * Weeks 13-24 were corrected by a controller audit against the source
 * brief: the brief's actual per-phase essential list for Race-specific,
 * Specific prep, and Taper is *one* strength-maintenance session (slot 1),
 * the quality run (slot 4), the easy run (slot 2), and the hybrid/race
 * session (slot 6) -- not two strength sessions. The easy run carries the
 * plan's shin-durability work and must not be the session sacrificed to
 * protect a second strength day under compression. See `phases.ts`'s
 * `PHASE_TYPICAL_PRIORITY` doc comment for the full rationale.
 *
 * Written by hand here, independently of `PHASE_TYPICAL_PRIORITY` in
 * `phases.ts`, so this test pins the intended design rather than checking
 * the implementation against itself.
 */
const EXPECTED: Record<number, { essential: number[]; important?: number; optional?: number }> = {
  1: { essential: [1, 2, 4, 5], important: 6, optional: 3 },
  2: { essential: [1, 2, 4, 5], important: 6, optional: 3 },
  3: { essential: [1, 2, 4, 5], important: 6, optional: 3 },
  4: { essential: [1, 2, 4, 5], important: 6, optional: 3 },
  5: { essential: [1, 2, 4, 5], important: 6, optional: 3 },
  6: { essential: [1, 2, 4, 5], important: 6, optional: 3 },
  7: { essential: [1, 4, 5, 6], important: 2, optional: 3 },
  8: { essential: [1, 4, 5, 6], important: 2, optional: 3 },
  9: { essential: [1, 4, 5, 6], important: 2, optional: 3 },
  10: { essential: [1, 4, 5, 6], important: 2, optional: 3 },
  11: { essential: [1, 4, 5, 6], important: 2, optional: 3 },
  12: { essential: [1, 2, 4, 6] },
  13: { essential: [1, 2, 4, 6], important: 5, optional: 3 },
  14: { essential: [1, 2, 4, 6], important: 5, optional: 3 },
  15: { essential: [1, 2, 4, 6], important: 5, optional: 3 },
  16: { essential: [1, 2, 4, 6], important: 5 },
  17: { essential: [1, 2, 4, 6], important: 5, optional: 3 },
  18: { essential: [1, 4, 5, 6] },
  19: { essential: [1, 2, 4, 6], important: 5, optional: 3 },
  20: { essential: [1, 2, 4, 6], important: 5, optional: 3 },
  21: { essential: [1, 4, 5, 6] },
  22: { essential: [1, 2, 4, 6], important: 5 },
  23: { essential: [1, 2, 4, 6], important: 5, optional: 3 },
  24: { essential: [1, 2, 4, 6] },
}

const weekByNumber = (n: number) => {
  const week = SEED_WEEKS_24.find((w) => w.weekNumber === n)
  if (!week) throw new Error(`No week ${String(n)} in SEED_WEEKS_24`)
  return week
}

describe('priorities (D7)', () => {
  it('in every week, the essential/important/optional slots match the expected per-phase layout', () => {
    for (const [weekStr, expected] of Object.entries(EXPECTED)) {
      const weekNumber = Number(weekStr)
      const week = weekByNumber(weekNumber)
      const actualEssential = week.templates.filter((t) => t.priority === 'essential').map((t) => t.sessionSlot).sort((a, b) => a - b)
      expect(actualEssential, `week ${String(weekNumber)} essential slots`).toEqual([...expected.essential].sort((a, b) => a - b))

      if (expected.important !== undefined) {
        const important = week.templates.find((t) => t.sessionSlot === expected.important)
        expect(important?.priority, `week ${String(weekNumber)} slot ${String(expected.important)} should be important`).toBe('important')
      }
      if (expected.optional !== undefined) {
        const optional = week.templates.find((t) => t.sessionSlot === expected.optional)
        expect(optional?.priority, `week ${String(weekNumber)} slot ${String(expected.optional)} should be optional`).toBe('optional')
      }
      const importantCount = week.templates.filter((t) => t.priority === 'important').length
      const optionalCount = week.templates.filter((t) => t.priority === 'optional').length
      expect(importantCount, `week ${String(weekNumber)} important count`).toBe(expected.important !== undefined ? 1 : 0)
      expect(optionalCount, `week ${String(weekNumber)} optional count`).toBe(expected.optional !== undefined ? 1 : 0)
    }
  })

  it('every week has at least 4 essential templates, or where a week has only 4 templates, all 4 are essential', () => {
    for (const week of SEED_WEEKS_24) {
      const essentialCount = week.templates.filter((t) => t.priority === 'essential').length
      expect(essentialCount).toBeGreaterThanOrEqual(4)
      if (week.templates.length === 4) {
        expect(essentialCount).toBe(4)
      }
    }
  })

  it('Zone 2 templates are always optional', () => {
    const zone2Templates = SEED_WEEKS_24.flatMap((w) => w.templates).filter((t) => t.sessionSlot === 3)
    expect(zone2Templates.length).toBeGreaterThan(0)
    for (const t of zone2Templates) expect(t.priority).toBe('optional')
  })

  it('no week has more than one optional template beyond Zone 2 in weeks 1-12', () => {
    for (let n = 1; n <= 12; n += 1) {
      const week = weekByNumber(n)
      const nonZone2Optional = week.templates.filter((t) => t.priority === 'optional' && t.sessionSlot !== 3)
      expect(nonZone2Optional.length).toBeLessThanOrEqual(1)
    }
    // Non-vacuous: confirm at least one week in 1-12 has a real (Zone 2)
    // optional template at all, so the filter above isn't checking empty weeks.
    const anyOptionalInRange = Array.from({ length: 12 }, (_, i) => weekByNumber(i + 1)).some((w) => w.templates.some((t) => t.priority === 'optional'))
    expect(anyOptionalInRange).toBe(true)
  })

  it("every week's essential count is >= MIN_EFFECTIVE_WEEK_SESSIONS (4)", () => {
    for (const week of SEED_WEEKS_24) {
      expect(week.templates.filter((t) => t.priority === 'essential').length).toBeGreaterThanOrEqual(4)
    }
  })

  it('in weeks 13-22, the easy-run-bearing template is essential whenever it is scheduled that week', () => {
    // Controller-corrected regression guard: the easy run carries the three
    // lower-leg durability exercises the plan's shin-durability strategy
    // depends on, so it must never be downgraded to `important` (and so
    // sacrificed under compression) in favour of a second strength session.
    let weeksWithEasyRun = 0
    for (let n = 13; n <= 22; n += 1) {
      const week = weekByNumber(n)
      const easyRunTemplate = week.templates.find((t) => t.prescriptions.some((p) => p.exerciseId === 'ex_easy_run'))
      if (!easyRunTemplate) continue // weeks 18 and 21 don't schedule slot 2 at all that week
      weeksWithEasyRun += 1
      expect(easyRunTemplate.priority, `week ${String(n)} easy run should be essential`).toBe('essential')
    }
    // Non-vacuous: most weeks in this range do schedule an easy run, so the
    // check above is actually exercised, not skipped every time.
    expect(weeksWithEasyRun).toBe(8) // 13,14,15,16,17,19,20,22 (18 and 21 have none)
  })
})
