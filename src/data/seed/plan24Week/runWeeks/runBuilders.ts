import type { PaceSource, Priority } from '@/data/types'
import { lowerLegDurabilityPrescriptions, positiveRestSec } from '../stationCircuits'
import type { SeedIntervalSpec, SeedPrescription, SeedTemplate } from '../types'

/** Easy run (slot 2) always carries the lower-leg durability finisher (§19):
 * straight-knee calf raise, bent-knee calf raise, tibialis raise. This is the
 * shin-durability work the whole running progression depends on. */
export function buildEasyRunTemplate(minutes: number, sequenceInWeek: number, priority: Priority): SeedTemplate {
  const prescriptions: SeedPrescription[] = [
    { exerciseId: 'ex_easy_run', order: 0, durationSec: minutes * 60, restSec: positiveRestSec('ex_easy_run', 60) },
    ...lowerLegDurabilityPrescriptions(1),
  ]
  return {
    sessionSlot: 2,
    sequenceInWeek,
    name: 'Easy run + durability',
    kind: 'run',
    priority,
    recoveryTags: ['easyRun'],
    estMinutes: minutes + 10,
    prescriptions,
  }
}

interface LongRunOptions {
  name?: string
  notes?: string
  /** Week 16's consolidation dip: no station work happens this week, but the
   * week-level station-volume figure still needs to read 40% (non-decreasing
   * everywhere else 13->21) so it lives on this template too. */
  stationVolumePct?: number
}

/** Plain long run (slot 6, Base/Build phases before hybrid conditioning
 * begins, and the week 16 consolidation dip). */
export function buildLongRunTemplate(minutes: number, sequenceInWeek: number, priority: Priority, opts: LongRunOptions = {}): SeedTemplate {
  const noteFields = opts.notes !== undefined ? { notes: opts.notes } : {}
  const stationPctFields = opts.stationVolumePct !== undefined ? { stationVolumePct: opts.stationVolumePct } : {}
  return {
    sessionSlot: 6,
    sequenceInWeek,
    name: opts.name ?? 'Long run',
    kind: 'run',
    priority,
    recoveryTags: ['longRun'],
    estMinutes: minutes,
    ...noteFields,
    ...stationPctFields,
    prescriptions: [
      { exerciseId: 'ex_long_run', order: 0, durationSec: minutes * 60, restSec: positiveRestSec('ex_long_run', 60) },
    ],
  }
}

interface IntervalQualityOptions {
  workSec?: number
  workDistanceM?: number
  paceSource?: PaceSource
  name?: string
  notes?: string
  extra?: SeedPrescription[]
}

/** Rough estimate: reps x (work + recovery), plus a fixed warmup/cooldown buffer. */
function estimateIntervalMinutes(reps: number, workSec: number, recoverySec: number): number {
  const WARMUP_COOLDOWN_MIN = 15
  return Math.round((reps * (workSec + recoverySec)) / 60) + WARMUP_COOLDOWN_MIN
}

/** Quality run (slot 4): reps of either a fixed work duration (weeks 1-6) or
 * a fixed work distance (weeks 7+), sharing one builder so the interval
 * shape lives in one place rather than being duplicated per week. */
export function buildIntervalQualityTemplate(
  reps: number,
  recoverySec: number,
  sequenceInWeek: number,
  priority: Priority,
  opts: IntervalQualityOptions,
): SeedTemplate {
  const intervalSpec: SeedIntervalSpec = { reps, recoverySec, ...(opts.workSec !== undefined ? { workSec: opts.workSec } : {}), ...(opts.workDistanceM !== undefined ? { workDistanceM: opts.workDistanceM } : {}) }
  const paceFields = opts.paceSource ? { paceSource: opts.paceSource } : {}
  const noteFields = opts.notes !== undefined ? { notes: opts.notes } : {}
  const prescriptions: SeedPrescription[] = [
    { exerciseId: 'ex_quality_run', order: 0, restSec: positiveRestSec('ex_quality_run', 90), intervalSpec, ...paceFields, ...noteFields },
    ...(opts.extra ?? []),
  ]
  const workSecForEstimate = opts.workSec ?? 240
  return {
    sessionSlot: 4,
    sequenceInWeek,
    name: opts.name ?? 'Quality run',
    kind: 'run',
    priority,
    recoveryTags: ['hardRun', 'highImpactStation'],
    estMinutes: estimateIntervalMinutes(reps, workSecForEstimate, recoverySec),
    prescriptions,
  }
}

interface ContinuousRunOptions {
  sessionSlot: number
  name: string
  recoveryTags: SeedTemplate['recoveryTags']
  paceSource?: PaceSource
  distanceM?: number
  notes?: string
}

/** A single continuous run with no interval structure: a tempo effort (week
 * 8's deload, week 18's "easy quality only"), or a distance test (week 12's
 * standalone 5 km benchmark). Exactly one of `minutes`/`opts.distanceM`
 * drives the prescription. */
export function buildContinuousRunTemplate(minutes: number, sequenceInWeek: number, priority: Priority, opts: ContinuousRunOptions): SeedTemplate {
  const paceFields = opts.paceSource ? { paceSource: opts.paceSource } : {}
  const noteFields = opts.notes !== undefined ? { notes: opts.notes } : {}
  const distanceFields = opts.distanceM !== undefined ? { distanceM: opts.distanceM } : { durationSec: minutes * 60 }
  return {
    sessionSlot: opts.sessionSlot,
    sequenceInWeek,
    name: opts.name,
    kind: 'run',
    priority,
    recoveryTags: opts.recoveryTags,
    estMinutes: minutes,
    prescriptions: [
      { exerciseId: 'ex_quality_run', order: 0, restSec: positiveRestSec('ex_quality_run', 90), ...distanceFields, ...paceFields, ...noteFields },
    ],
  }
}
