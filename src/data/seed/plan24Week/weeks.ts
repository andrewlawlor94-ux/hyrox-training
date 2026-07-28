import type { Priority } from '@/data/types'
import { MIN_EFFECTIVE_WEEK_SESSIONS } from '@/domain/queue/constants'
import { PHASE_TYPICAL_PRIORITY, ZONE2_SLOT, phaseForWeek } from './phases'
import { buildStrengthA, buildStrengthB } from './strengthTemplates'
import { RUN_PROGRESSION, buildRaceWeekTechniqueTemplate, buildZone2Template } from './runProgression'
import type { SeedTemplate, SeedWeek } from './types'

const TOTAL_WEEKS = 24
const DELOAD_WEEKS = new Set([4, 8])
/**
 * Reduced-to-minimum weeks (D5): every one of these carries only its
 * essential four sessions -- see `weeks.test.ts`/`priorities.test.ts`.
 *
 * All four keep slot 1 (one strength-maintenance session), never slot 5 (a
 * second strength day): weeks 18 and 21 are built around a full-format
 * simulation, which itself supplies abundant station and strength stimulus,
 * so a second dedicated strength day is the lowest-value session present --
 * while slot 2 (easy run + the straight-knee calf raise, bent-knee calf
 * raise, and tibialis raise) is the *highest*-value session, precisely
 * because these are the two highest-running-impact weeks in the whole plan.
 * Dropping Strength B and keeping the durability work is the correct trade
 * in both weeks. (Controller-corrected: weeks 18/21 previously used
 * `[1, 4, 5, 6]`, keeping both strength sessions and scheduling no
 * durability work at all in the plan's two most demanding weeks.)
 */
const MIN_SESSION_WEEK_SLOTS: Record<number, readonly number[]> = {
  12: [1, 2, 4, 6],
  18: [1, 2, 4, 6],
  21: [1, 2, 4, 6],
  24: [1, 2, 4, 6],
}
/** Consolidation weeks: full slot set minus Zone 2 (five sessions). */
const FIVE_SESSION_WEEK_SLOTS: Record<number, readonly number[]> = {
  16: [1, 2, 4, 5, 6],
  22: [1, 2, 4, 5, 6],
}
const FULL_WEEK_SLOTS: readonly number[] = [1, 2, 3, 4, 5, 6]

const WEEK_NOTES: Record<number, string> = {
  4: 'Deload week: running volume drops so the body absorbs the last three weeks of aerobic build.',
  8: 'Deload week: running volume drops before the week 12 benchmark test.',
  12: 'Benchmark week: a standalone 5 km time test plus a half-HYROX simulation (4 x 1 km, all eight stations at half volume).',
  16: 'Consolidation week: reduced volume and no dedicated station work before the final race-specific push.',
  18: 'Full-format simulation week: the near-full rehearsal, about six weeks from race day.',
  21: 'Controlled full-format rehearsal, about three weeks from race day -- executed under control, not as an all-out race.',
  22: 'Reduced-volume consolidation heading into the taper: heavy strength drops, intensity is preserved.',
  23: 'Taper: roughly 60-70% of peak volume, no exhausting simulation.',
  24: 'Race week: roughly 35-45% of peak volume, sharpening for race day.',
}

function slotsForWeek(weekNumber: number): readonly number[] {
  return MIN_SESSION_WEEK_SLOTS[weekNumber] ?? FIVE_SESSION_WEEK_SLOTS[weekNumber] ?? FULL_WEEK_SLOTS
}

/**
 * D7/D5: whichever of a phase's two flex slots (Zone 2 always optional, one
 * of {easy run, slot 6} important) is present that week keeps its typical
 * priority -- *except* in a reduced-to-minimum (four-session) week, where
 * every present session is essential by definition (D5's four-session
 * minimum leaves no room for a non-essential session).
 */
function priorityForSlot(weekSlots: readonly number[], slot: number, importantSlot: number): Priority {
  if (weekSlots.length <= MIN_EFFECTIVE_WEEK_SESSIONS) return 'essential'
  if (slot === ZONE2_SLOT) return 'optional'
  if (slot === importantSlot) return 'important'
  return 'essential'
}

function buildTemplateForSlot(weekNumber: number, slot: number, sequenceInWeek: number, priority: Priority): SeedTemplate {
  const runEntry = RUN_PROGRESSION[weekNumber]
  if (!runEntry) throw new Error(`No run-progression entry for week ${String(weekNumber)}`)
  switch (slot) {
    case 1:
      return weekNumber === TOTAL_WEEKS ? buildRaceWeekTechniqueTemplate(sequenceInWeek, priority) : buildStrengthA(weekNumber, sequenceInWeek, priority)
    case 2:
      return { ...runEntry.easy, sequenceInWeek, priority }
    case 3:
      return buildZone2Template(weekNumber, runEntry.zone2Minutes, sequenceInWeek)
    case 4:
      return { ...runEntry.quality, sequenceInWeek, priority }
    case 5:
      return buildStrengthB(weekNumber, sequenceInWeek, priority)
    case 6:
      return { ...runEntry.slotSix, sequenceInWeek, priority }
    default:
      throw new Error(`Unknown session slot: ${String(slot)}`)
  }
}

/**
 * Cross-checks `priorityForSlot`'s output against `typical.essentialSlots`
 * so that constant is genuinely load-bearing rather than descriptive-only:
 * editing one of `essentialSlots`/`importantSlot` without the other now
 * throws at build time instead of silently drifting apart. Skipped for
 * reduced-to-minimum weeks (<= 4 slots present), where D5 overrides the
 * phase's typical split entirely (every present session is essential).
 *
 * Exported (not just called internally) so `weeks.test.ts` can construct a
 * deliberately inconsistent mapping and assert this throws -- a permanent
 * regression test, not something proven only by an uncommitted manual break.
 */
export function assertMatchesTypicalEssentialSlots(weekNumber: number, weekSlots: readonly number[], templates: readonly SeedTemplate[], essentialSlots: readonly number[]): void {
  if (weekSlots.length <= MIN_EFFECTIVE_WEEK_SESSIONS) return
  const actual = templates.filter((t) => t.priority === 'essential').map((t) => t.sessionSlot).sort((a, b) => a - b)
  const expected = essentialSlots.filter((slot) => weekSlots.includes(slot)).sort((a, b) => a - b)
  if (actual.length !== expected.length || actual.some((slot, i) => slot !== expected[i])) {
    throw new Error(`Week ${String(weekNumber)}: essential slots ${JSON.stringify(actual)} do not match typical.essentialSlots ${JSON.stringify(expected)}`)
  }
}

function buildWeek(weekNumber: number): SeedWeek {
  const phase = phaseForWeek(weekNumber)
  const typical = PHASE_TYPICAL_PRIORITY[phase.name]
  if (!typical) throw new Error(`No typical priority mapping for phase: ${phase.name}`)
  const weekSlots = slotsForWeek(weekNumber)
  const templates = weekSlots.map((slot, sequenceInWeek) =>
    buildTemplateForSlot(weekNumber, slot, sequenceInWeek, priorityForSlot(weekSlots, slot, typical.importantSlot)),
  )
  assertMatchesTypicalEssentialSlots(weekNumber, weekSlots, templates, typical.essentialSlots)
  const notes = WEEK_NOTES[weekNumber]
  return {
    weekNumber,
    phaseName: phase.name,
    label: `Week ${String(weekNumber)} -- ${phase.name}`,
    isDeload: DELOAD_WEEKS.has(weekNumber),
    ...(notes !== undefined ? { notes } : {}),
    templates,
  }
}

/** Recursively freezes an object/array so downstream code cannot mutate the
 * seed data in place -- a shallow copy of `SEED_WEEKS_24` still shares every
 * nested object with the source, and strict-mode ESM throws on any write to
 * a frozen property, catching accidental mutation immediately rather than
 * corrupting the shared singleton silently. */
function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

function buildAllWeeks(): SeedWeek[] {
  return Array.from({ length: TOTAL_WEEKS }, (_, i) => buildWeek(i + 1))
}

/** The full 24-week seeded plan (§19), generated from phase, week, and
 * template configuration rather than hand-written -- see `phases.ts`,
 * `strengthTemplates.ts`, and `runProgression.ts` for the generators. */
export const SEED_WEEKS_24: readonly SeedWeek[] = deepFreeze(buildAllWeeks())
