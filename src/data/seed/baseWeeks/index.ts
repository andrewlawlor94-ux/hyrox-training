/**
 * Prescriptions for the generated Base-week prologue (`generateBaseWeeks` in
 * `@/domain/planGeneration/baseWeeks`). The domain layer produces scheduling
 * metadata only -- slot, priority, recovery tags, name, duration -- because it
 * cannot reach exercise content: exercise ids only exist once seeded, and the
 * pure domain layer may not import from `@/data/**` (enforced by
 * `src/domain/__tests__/purity.test.ts` and an ESLint `no-restricted-imports`
 * rule). This module supplies the actual prescriptions for each Base-week
 * slot, reusing the same builders the core 24-week plan uses so Base-week
 * content never diverges from how the real plan trains the same session
 * types (§19, D1).
 */
import type { BaseWeekTemplate } from '@/domain/planGeneration/baseWeeks'
import type { SeedPrescription } from '@/data/seed/plan24Week/types'
import { buildStrengthA, buildStrengthB } from '@/data/seed/plan24Week/strengthTemplates'
import { buildEasyRunTemplate, buildLongRunTemplate } from '@/data/seed/plan24Week/runWeeks/runBuilders'
import { buildZone2Template } from '@/data/seed/plan24Week/runWeeks/zone2'

/**
 * Both Base-week strength sessions are built at week 1's dosing tier (full
 * volume, plus a literal starting `targetLoad`) on every Base week, not just
 * the first one. That literal load only ever matters while there is no
 * logged history for the exercise yet (`recommendStrengthTarget`'s "no usable
 * history" rule falls back to `prescription.targetLoad ?? 0`) -- so repeating
 * it on Base weeks 2+ is harmless: by then the athlete already has logged
 * history for these exercises and the recommendation engine ignores the
 * prescription's literal load entirely. Using the later "maintenance" dosing
 * tier instead (weeks 13+) would seed no literal load at all, which would
 * leave the athlete's actual first-ever session in the app recommending a
 * 0 lb back squat -- exactly the kind of "technically present but useless
 * content" this fix exists to avoid.
 */
const BASE_STRENGTH_WEEK_NUMBER = 1

/**
 * Builds the prescriptions for one Base-week session, keyed by the fixed
 * five-slot order `generateBaseWeeks` produces (§19, D1): 1 Strength A
 * maintenance, 2 easy run + durability, 3 Zone 2, 4 Strength B maintenance,
 * 5 long easy run. Only `.prescriptions` is taken from each builder's
 * returned template -- name/kind/priority/recoveryTags/estMinutes stay
 * authoritative from the domain-generated `BaseWeekTemplate` itself, so a
 * builder's own scheduling fields (e.g. Strength A's `highImpactStation` tag)
 * never leak into a Base-week instance.
 */
export function buildBaseWeekPrescriptions(template: BaseWeekTemplate): SeedPrescription[] {
  switch (template.sessionSlot) {
    case 1:
      return buildStrengthA(BASE_STRENGTH_WEEK_NUMBER, template.sequenceInWeek, template.priority).prescriptions
    case 2:
      return buildEasyRunTemplate(template.estMinutes, template.sequenceInWeek, template.priority).prescriptions
    case 3:
      return buildZone2Template(template.weekNumber, template.estMinutes, template.sequenceInWeek).prescriptions
    case 4:
      return buildStrengthB(BASE_STRENGTH_WEEK_NUMBER, template.sequenceInWeek, template.priority).prescriptions
    case 5:
      return buildLongRunTemplate(template.estMinutes, template.sequenceInWeek, template.priority).prescriptions
    default:
      throw new Error(`Unknown Base-week session slot: ${String(template.sessionSlot)}`)
  }
}
