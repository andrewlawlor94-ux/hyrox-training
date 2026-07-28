import type { PaceSource, Priority, Station, WorkoutKind } from '@/data/types'
import { buildCompromisedRunPrescription, buildStationCircuit, buildStationPrescription } from '../stationCircuits'
import type { SeedPrescription, SeedTemplate } from '../types'

interface HybridTemplateOptions {
  kind?: WorkoutKind
  name?: string
  notes?: string
  stationVolumePct?: number
  runRecoverySec?: number
  runPaceSource?: PaceSource
  /** Extra prescriptions appended after the main run+station circuit, e.g. a
   * dedicated wall-ball fatigue finisher (weeks 20, 22). */
  extra?: SeedPrescription[]
}

/**
 * Builds a slot-6 hybrid/simulation session: `runReps` legs of 1 km off
 * tired legs (`ex_compromised_run`), interleaved conceptually with
 * `stationCount` HYROX stations (in race order, so fewer stations means a
 * rotating subset rather than the full eight) at `stationVolumePct` of full
 * race volume. `stationCount === 8` is the full-format circuit used by the
 * half/75%/100% simulations and rehearsals.
 */
export function buildHybridTemplate(
  runReps: number,
  stationCount: number,
  sequenceInWeek: number,
  priority: Priority,
  opts: HybridTemplateOptions = {},
): SeedTemplate {
  const stationVolumePct = opts.stationVolumePct ?? 100
  const runRecoverySec = opts.runRecoverySec ?? 90
  const runPrescription = buildCompromisedRunPrescription(runReps, 1000, runRecoverySec, 0, opts.runPaceSource ? { paceSource: opts.runPaceSource } : {})
  const stationPrescriptions = buildStationCircuit(stationCount, stationVolumePct, 1)
  const prescriptions: SeedPrescription[] = [runPrescription, ...stationPrescriptions, ...(opts.extra ?? [])]
  const stationPctFields = opts.stationVolumePct !== undefined ? { stationVolumePct: opts.stationVolumePct } : {}
  const noteFields = opts.notes !== undefined ? { notes: opts.notes } : {}
  // Rough estimate: ~5 min per run leg + ~4 min per station touched, plus a warmup buffer.
  const WARMUP_MIN = 10
  const MIN_PER_RUN_LEG = 5
  const MIN_PER_STATION = 4
  const estMinutes = WARMUP_MIN + runReps * MIN_PER_RUN_LEG + stationCount * MIN_PER_STATION + (opts.extra?.length ?? 0) * MIN_PER_STATION
  return {
    sessionSlot: 6,
    sequenceInWeek,
    name: opts.name ?? `Hybrid: ${String(runReps)} rounds`,
    kind: opts.kind ?? 'hybrid',
    priority,
    recoveryTags: ['hybrid', 'highImpactStation'],
    estMinutes,
    ...stationPctFields,
    ...noteFields,
    prescriptions,
  }
}

interface CompromisedQualityOptions {
  stationVolumePct: number
  notes?: string
}

/** Quality-slot (4) "compromised N x (1 km + station)" sessions (weeks 14,
 * 17, 20): running off tired legs plus one representative station. */
export function buildCompromisedQualityTemplate(
  reps: number,
  station: Station,
  sequenceInWeek: number,
  priority: Priority,
  opts: CompromisedQualityOptions,
): SeedTemplate {
  const noteFields = opts.notes !== undefined ? { notes: opts.notes } : {}
  const prescriptions: SeedPrescription[] = [
    buildCompromisedRunPrescription(reps, 1000, 90, 0),
    buildStationPrescription(station, opts.stationVolumePct, 1),
  ]
  const WARMUP_MIN = 10
  const MIN_PER_RUN_LEG = 5
  return {
    sessionSlot: 4,
    sequenceInWeek,
    name: 'Compromised run + station',
    kind: 'run',
    priority,
    recoveryTags: ['hardRun', 'highImpactStation'],
    estMinutes: WARMUP_MIN + reps * MIN_PER_RUN_LEG,
    stationVolumePct: opts.stationVolumePct,
    ...noteFields,
    prescriptions,
  }
}
