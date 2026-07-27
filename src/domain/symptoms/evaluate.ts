import type { ISODate, SymptomLevel, SymptomLog, SymptomStream } from '@/domain/types'
import { daysBetween } from '@/domain/dates'
import {
  RED_FLAG_SCREEN_SCIATIC_MIN,
  SYMPTOM_BASELINE_MIN_SAMPLES,
  SYMPTOM_BASELINE_WINDOW,
  SYMPTOM_CAUTION_MAX,
  SYMPTOM_DELTA_DECIMAL_PLACES,
  SYMPTOM_GREEN_MAX,
  SYMPTOM_PERSISTENCE_COUNT,
  SYMPTOM_PERSISTENCE_MIN_SCORE,
  SYMPTOM_SERIES_WINDOW_DAYS,
  SYMPTOM_SPIKE_DELTA,
} from './constants'

export interface StreamState {
  latest: number | null
  baseline: number | null
  level: SymptomLevel
  spikeFlag: boolean
  persistenceFlag: boolean
  reasons: string[]
  series: { date: ISODate; value: number }[]
}

export interface SymptomState {
  shin: StreamState
  sciatic: StreamState
  meanSessionRpe: number | null
  anyFlag: boolean
  needsRedFlagScreen: boolean
}

/** Plain-language label used in a stream's reason strings. */
const STREAM_LABEL: Record<SymptomStream, string> = {
  shin: 'Shin',
  sciatic: 'Sciatic',
}

/** Reads a stream's score off a log — the one place that knows the field
 * names differ from the stream keys (`shinPain` / `sciaticPain`). */
const STREAM_ACCESSOR: Record<SymptomStream, (log: SymptomLog) => number> = {
  shin: (log) => log.shinPain,
  sciatic: (log) => log.sciaticPain,
}

/** Maps a 0-10 symptom score to its traffic-light level. Thresholds are
 * `SYMPTOM_GREEN_MAX` / `SYMPTOM_CAUTION_MAX` from constants.ts. */
export function levelFor(score: number): SymptomLevel {
  if (score <= SYMPTOM_GREEN_MAX) return 'green'
  if (score <= SYMPTOM_CAUTION_MAX) return 'caution'
  return 'elevated'
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Evaluates one stream (shin or sciatic) from logs already filtered to the
 * window and sorted most-recent-first. `sortedDesc[0]` is the latest log;
 * the baseline is deliberately drawn from indices 1..SYMPTOM_BASELINE_WINDOW
 * (the 2nd through 6th most recent) so the latest log never contributes to
 * its own baseline — including it would let a spike partially cancel itself
 * out and the flag would fire late.
 */
function evaluateStream(stream: SymptomStream, sortedDesc: SymptomLog[]): StreamState {
  const accessor = STREAM_ACCESSOR[stream]
  const label = STREAM_LABEL[stream]
  const values = sortedDesc.map(accessor)

  const latest = values[0] ?? null

  const baselineSamples = values.slice(1, 1 + SYMPTOM_BASELINE_WINDOW)
  const baseline = baselineSamples.length >= SYMPTOM_BASELINE_MIN_SAMPLES ? mean(baselineSamples) : null

  const reasons: string[] = []

  const spikeFlag = latest !== null && baseline !== null && latest - baseline >= SYMPTOM_SPIKE_DELTA
  if (spikeFlag && baseline !== null && latest !== null) {
    const delta = (latest - baseline).toFixed(SYMPTOM_DELTA_DECIMAL_PLACES)
    reasons.push(`${label} pain is ${delta} points above your recent baseline.`)
  }

  const persistenceWindow = values.slice(0, SYMPTOM_PERSISTENCE_COUNT)
  const persistenceFlag = persistenceWindow.length === SYMPTOM_PERSISTENCE_COUNT
    && persistenceWindow.every((v) => v >= SYMPTOM_PERSISTENCE_MIN_SCORE)
  if (persistenceFlag) {
    reasons.push(`${label} pain has been ${SYMPTOM_PERSISTENCE_MIN_SCORE} or higher for ${SYMPTOM_PERSISTENCE_COUNT} workouts in a row.`)
  }

  const series = [...sortedDesc]
    .reverse()
    .map((log) => ({ date: log.forDate, value: accessor(log) }))

  return { latest, baseline, level: levelFor(latest ?? 0), spikeFlag, persistenceFlag, reasons, series }
}

/**
 * Evaluates both symptom streams from raw logs. `today` and `windowDays`
 * gate which logs are considered at all — an old flare outside the window
 * must not flag a currently-healthy athlete, so windowing is applied before
 * either the series or the flag computation, not just the chart.
 */
export function evaluateSymptoms(logs: SymptomLog[], today: ISODate, windowDays = SYMPTOM_SERIES_WINDOW_DAYS): SymptomState {
  const inWindow = logs.filter((log) => daysBetween(log.forDate, today) <= windowDays)

  const sortedDesc = [...inWindow].sort((a, b) => (a.forDate < b.forDate ? 1 : a.forDate > b.forDate ? -1 : 0))

  const shin = evaluateStream('shin', sortedDesc)
  const sciatic = evaluateStream('sciatic', sortedDesc)

  const meanSessionRpe = inWindow.length > 0 ? mean(inWindow.map((log) => log.sessionRpe)) : null

  const anyFlag = shin.spikeFlag || shin.persistenceFlag || sciatic.spikeFlag || sciatic.persistenceFlag
  const needsRedFlagScreen = (sciatic.latest !== null && sciatic.latest >= RED_FLAG_SCREEN_SCIATIC_MIN)
    || sciatic.spikeFlag || sciatic.persistenceFlag

  return { shin, sciatic, meanSessionRpe, anyFlag, needsRedFlagScreen }
}
