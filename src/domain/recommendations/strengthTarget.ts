import type { Exercise, ISODate, Load, Prescription, RecommendationMode, SymptomStream, Unit } from '@/domain/types'
import { convertLoad } from '@/domain/units/convert'
import { formatLoad } from '@/domain/units/format'
import { DAYS_PER_WEEK, ISO_DATE_FIELD_WIDTH, MIN_RIR_FOR_INCREASE } from './constants'
import { effectiveIncrement, gatingSymptomFor, isSymptomGated } from './increments'
import type { RecommendationSymptomState } from './increments'

export interface StrengthSessionHistory {
  date: ISODate
  prescribedSets: number
  prescribedRepMin: number
  completedSets: { weight: number; unit: Unit; reps: number; rir?: number }[]
}

export interface StrengthRecommendation {
  previous: { load: Load; reps: number; date: ISODate } | null
  lastWeek: { load: Load; reps: number; date: ISODate } | null
  target: Load
  mode: RecommendationMode
  reason: string
  /** True when `target` is an aim to consider, not a prefill. Prefill stays at `previous`. */
  isOptionalAim: boolean
}

/** Human-readable label for a symptom stream, used in the symptomHold reason. */
const SYMPTOM_LABEL: Record<SymptomStream, string> = {
  sciatic: 'sciatic/back',
  shin: 'shin/impact',
}

// --- Local date arithmetic (do not create src/domain/dates.ts — a later
// task owns the shared module; this helper is intentionally private and
// minimal, using explicit UTC values throughout so it never depends on the
// host machine's timezone or on reading the system clock). ---

function parseISODateParts(date: ISODate): [number, number, number] {
  const parts = date.split('-').map(Number)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

function toUTCDate(date: ISODate): Date {
  const [year, month, day] = parseISODateParts(date)
  return new Date(Date.UTC(year, month - 1, day))
}

function toISODateString(date: Date): ISODate {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(ISO_DATE_FIELD_WIDTH, '0')
  const day = String(date.getUTCDate()).padStart(ISO_DATE_FIELD_WIDTH, '0')
  return `${year}-${month}-${day}`
}

function addUTCDays(date: Date, days: number): Date {
  const result = new Date(date.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

/**
 * The Monday-start ISO calendar week immediately preceding the week
 * containing `today`, as an inclusive [start, end] ISODate range. Pure
 * string/UTC arithmetic — never reads the ambient clock.
 */
function previousWeekRange(today: ISODate): { start: ISODate; end: ISODate } {
  const date = toUTCDate(today)
  const dayOfWeek = date.getUTCDay() // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dayOfWeek + (DAYS_PER_WEEK - 1)) % DAYS_PER_WEEK
  const thisMonday = addUTCDays(date, -daysSinceMonday)
  const previousMonday = addUTCDays(thisMonday, -DAYS_PER_WEEK)
  const previousSunday = addUTCDays(thisMonday, -1)
  return { start: toISODateString(previousMonday), end: toISODateString(previousSunday) }
}

// --- Session history helpers ---

interface SessionSummary {
  load: Load
  reps: number
  date: ISODate
}

/**
 * Summarizes a session's performance. A normal working session prescribes
 * one weight and one rep target across all its sets, so the first completed
 * set is representative of the whole session; only the date meaningfully
 * varies across the history. Returns null for a session with no completed
 * sets at all (nothing usable to summarize).
 */
function summarizeSession(session: StrengthSessionHistory): SessionSummary | null {
  const firstSet = session.completedSets[0]
  if (!firstSet) return null
  return { load: { value: firstSet.weight, unit: firstSet.unit }, reps: firstSet.reps, date: session.date }
}

/**
 * Scans history (already sorted most-recent-first) for the first session
 * matching `predicate` that also has a usable summary, pairing the raw
 * session (needed for set-by-set rule evaluation) with its summary.
 */
function findMostRecentUsable(
  sortedDesc: StrengthSessionHistory[],
  predicate: (session: StrengthSessionHistory) => boolean,
): { session: StrengthSessionHistory; summary: SessionSummary } | null {
  for (const session of sortedDesc) {
    if (!predicate(session)) continue
    const summary = summarizeSession(session)
    if (summary) return { session, summary }
  }
  return null
}

/** Adds `increment` to `previousLoad`, converting the increment into the
 * previous load's unit first when the units differ (e.g. a kg-incremented
 * exercise logged in lb). A zero increment (station loads) is a no-op. */
function addIncrement(previousLoad: Load, increment: Load): Load {
  const converted = increment.unit === previousLoad.unit ? increment : convertLoad(increment, previousLoad.unit)
  return { value: previousLoad.value + converted.value, unit: previousLoad.unit }
}

export function recommendStrengthTarget(ctx: {
  exercise: Exercise
  prescription: Pick<Prescription, 'sets' | 'repMin' | 'targetLoad' | 'loadUnit'>
  history: StrengthSessionHistory[]
  symptoms: RecommendationSymptomState
  today: ISODate
  profileBodyWeight: Load
}): StrengthRecommendation {
  const { exercise, prescription, history, symptoms, today } = ctx

  // Sort a copy descending by date — ISO dates compare correctly as plain
  // strings, and the input array/objects are never mutated.
  const sortedDesc = [...history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const mostRecent = findMostRecentUsable(sortedDesc, () => true)

  // Rule 1: no usable history at all.
  if (!mostRecent) {
    return {
      previous: null,
      lastWeek: null,
      target: { value: prescription.targetLoad ?? 0, unit: prescription.loadUnit ?? exercise.defaultUnit },
      mode: 'default',
      reason: 'First time logging this exercise — starting from the plan default.',
      isOptionalAim: false,
    }
  }

  const { session: previousSession, summary: previous } = mostRecent
  const { start, end } = previousWeekRange(today)
  const lastWeekMatch = findMostRecentUsable(sortedDesc, (s) => s.date >= start && s.date <= end)
  const lastWeek = lastWeekMatch ? lastWeekMatch.summary : null

  // Rule 2: symptom gating takes precedence over an otherwise-qualifying increase.
  if (isSymptomGated(exercise, symptoms)) {
    const stream = gatingSymptomFor(exercise.category)
    const label = stream ? SYMPTOM_LABEL[stream] : ''
    return {
      previous,
      lastWeek,
      target: previous.load,
      mode: 'symptomHold',
      reason: `Holding ${formatLoad(previous.load)} while ${label} symptoms are elevated.`,
      isOptionalAim: false,
    }
  }

  const setsComplete = previousSession.completedSets.length >= previousSession.prescribedSets
  const repsOk = setsComplete && previousSession.completedSets.every((set) => set.reps >= previousSession.prescribedRepMin)

  if (repsOk) {
    let recordedCount = 0
    let rirSum = 0
    let lastRecordedRir: number | null = null
    for (const set of previousSession.completedSets) {
      if (set.rir === undefined) continue
      recordedCount += 1
      rirSum += set.rir
      lastRecordedRir = set.rir
    }

    // Rule 4: all sets and reps met but no set recorded any RIR.
    if (recordedCount === 0) {
      const target = addIncrement(previous.load, effectiveIncrement(exercise))
      return {
        previous,
        lastWeek,
        target,
        mode: 'optionalIncrease',
        reason: `All reps completed, but no RIR recorded — treat ${formatLoad(target)} as an optional aim.`,
        isOptionalAim: true,
      }
    }

    const meanRir = rirSum / recordedCount

    // Rule 3: all sets/reps met and mean RIR shows room to add load.
    if (meanRir >= MIN_RIR_FOR_INCREASE) {
      return {
        previous,
        lastWeek,
        target: addIncrement(previous.load, effectiveIncrement(exercise)),
        mode: 'increase',
        reason: 'You completed all prescribed reps last time.',
        isOptionalAim: false,
      }
    }

    // Rule 5 (reps met, but RIR too low — went to failure).
    return {
      previous,
      lastWeek,
      target: previous.load,
      mode: 'repeat',
      reason: `Repeating ${formatLoad(previous.load)} — last set went to failure (RIR ${lastRecordedRir ?? 0}).`,
      isOptionalAim: false,
    }
  }

  // Rule 5 (reps were the failure cause — checked before any RIR framing).
  return {
    previous,
    lastWeek,
    target: previous.load,
    mode: 'repeat',
    reason: `Repeating ${formatLoad(previous.load)} — you did not complete all prescribed reps last time.`,
    isOptionalAim: false,
  }
}
