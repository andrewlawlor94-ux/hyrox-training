import type { ISODate, SymptomStream } from '@/domain/types'
import type { StreamState, SymptomState } from './evaluate'
import { SYMPTOM_DISCLAIMER } from './constants'

export type SubstitutionKind =
  | 'reduceImpactVolume'
  | 'swapHardRunForLowImpact'
  | 'maintainCalfTibialis'
  | 'holdLoadProgression'
  | 'seekAssessment'
  | 'stopAggravatingExercise'

export interface Substitution {
  kind: SubstitutionKind
  stream: SymptomStream
  title: string
  detail: string
  /**
   * Whether accepting this actually CHANGES anything in the plan.
   *
   * Only two kinds do: cutting impact volume rewrites the affected sessions'
   * distances, and swapping a hard run rewrites its exercise. The rest are
   * advice — hold your loads, keep up the calf work, get it looked at — with
   * nothing for the app to rewrite. They were rendered with an "Accept" button
   * anyway, which called `applySubstitution`, which did nothing for those kinds
   * and reported success. The athlete found it exactly as it reads: "i also cant
   * accept them as the button doesn't work."
   */
  actionable: boolean
  /** Always appended by the UI. */
  disclaimer: string
}

/** Copy for each kind, independent of which stream triggered it — the
 * `stream` field on the produced Substitution records the attribution. */
const CONTENT: Record<SubstitutionKind, { title: string; detail: string; actionable: boolean }> = {
  reduceImpactVolume: {
    title: 'Reduce impact volume',
    detail: 'Cut running and other high-impact volume by 20-30% this week to let symptoms settle before pushing again.',
    actionable: true,
  },
  swapHardRunForLowImpact: {
    title: 'Swap a hard run for low-impact cardio',
    detail: 'Replace one hard run this week with an easy SkiErg or rowing session, so aerobic volume holds up without the impact.',
    actionable: true,
  },
  maintainCalfTibialis: {
    title: 'Keep up calf and tibialis strengthening',
    detail: 'Add or maintain calf-raise and tibialis-anterior strengthening work — it is the main lever for shin resilience.',
    actionable: false,
  },
  holdLoadProgression: {
    title: 'Hold load progression',
    detail: 'Keep barbell and station loads where they are for now rather than progressing, until symptoms settle back to green.',
    actionable: false,
  },
  seekAssessment: {
    title: 'Consider a professional assessment',
    detail: 'Pain that is persistent, worsening, or focal (concentrated in one spot) is worth having assessed by a physio or sports-medicine clinician.',
    actionable: false,
  },
  stopAggravatingExercise: {
    title: 'Stop the aggravating exercise',
    detail: 'Your sciatic pain score is high enough to treat as elevated. Stop whatever exercise aggravates it and seek clinical assessment rather than pushing through — and if you also notice it radiating, or any weakness or numbness, mention that when you are assessed.',
    actionable: false,
  },
}

/** Plain-language stream name, for a headline and a reason sentence. */
const STREAM_LABEL: Record<SymptomStream, string> = { shin: 'Shin', sciatic: 'Sciatic' }

export interface SymptomAdvice {
  stream: SymptomStream
  /** e.g. "Shin pain is elevated". */
  headline: string
  /**
   * The observation that raised this, in the athlete's own reported terms.
   *
   * Surfaced because the previous cards said what to do and never why, leaving
   * the athlete asking "im not sure why it thinks i need these suggestions based
   * on what i logged". `StreamState` already computed exactly this and nothing
   * displayed it.
   */
  reason: string
  /** The date of the report that raised it — used to key a dismissal, so a
   * later report raises the advice again rather than being silenced for ever. */
  triggeredOn: ISODate | null
  items: Substitution[]
  disclaimer: string
}

function makeSubstitution(kind: SubstitutionKind, stream: SymptomStream): Substitution {
  return { kind, stream, ...CONTENT[kind], disclaimer: SYMPTOM_DISCLAIMER }
}

/** The most recent report's date, or `null` when the stream has no logs. */
function latestDate(streamState: StreamState): ISODate | null {
  return streamState.series[streamState.series.length - 1]?.date ?? null
}

/**
 * Why this advice appeared, preferring the specific computed reason
 * (`StreamState.reasons` — a spike above baseline, or a run of painful
 * sessions) and falling back to the plain reported score.
 */
function reasonFor(stream: SymptomStream, streamState: StreamState): string {
  if (streamState.reasons.length > 0) return streamState.reasons.join(' ')
  const label = STREAM_LABEL[stream]
  const on = latestDate(streamState)
  const score = streamState.latest ?? 0
  return on === null
    ? `You reported ${label.toLowerCase()} pain of ${String(score)} out of 10.`
    : `You reported ${label.toLowerCase()} pain of ${String(score)} out of 10 on ${on}.`
}

/**
 * The kinds one stream's current state calls for, deduplicated (a stream can
 * qualify for the same kind through more than one rule).
 */
function kindsForStream(stream: SymptomStream, streamState: StreamState): SubstitutionKind[] {
  const kinds: SubstitutionKind[] = []

  const elevatedOrSpike = streamState.level === 'elevated' || streamState.spikeFlag
  if (elevatedOrSpike) {
    kinds.push('reduceImpactVolume', 'holdLoadProgression')
    if (stream === 'shin') kinds.push('swapHardRunForLowImpact', 'maintainCalfTibialis')
  }

  if (streamState.persistenceFlag) kinds.push('seekAssessment')

  // Elevated sciatic pain (reported score 5+): stop the aggravating exercise
  // and seek clinical assessment. This fires purely off the reported score —
  // the app captures no data about radiation, weakness, or numbness, so the
  // copy must not claim to have observed those signs (it may only invite the
  // athlete to consider them). Sciatic-specific — shin pain never triggers
  // stopping an exercise outright.
  if (stream === 'sciatic' && streamState.level === 'elevated') {
    kinds.push('stopAggravatingExercise', 'seekAssessment')
  }

  return [...new Set(kinds)]
}

/**
 * The training-load advice the current symptom state calls for: AT MOST ONE
 * ENTRY PER STREAM, so two at the very most and usually none.
 *
 * This used to return a flat list of individual suggestions, which Home then
 * rendered once per suggestion PER AFFECTED SESSION — across the whole
 * remaining plan. A single elevated shin report produced four suggestions
 * against every running session for the next six months: hundreds of identical
 * cards. The athlete's words were "the home tab has a crazy amount of
 * suggestions".
 *
 * One observation is one piece of news. "Cut impact volume this week" is a
 * single instruction, not one per session it touches, so the advice is grouped
 * under the stream that raised it and names its own reason.
 *
 * Never a diagnosis — every entry carries `SYMPTOM_DISCLAIMER` verbatim.
 */
export function buildSymptomAdvice(state: SymptomState): SymptomAdvice[] {
  const streams: SymptomStream[] = ['shin', 'sciatic']
  const advice: SymptomAdvice[] = []

  for (const stream of streams) {
    const streamState = state[stream]
    const kinds = kindsForStream(stream, streamState)
    if (kinds.length === 0) continue
    advice.push({
      stream,
      headline: `${STREAM_LABEL[stream]} pain needs attention`,
      reason: reasonFor(stream, streamState),
      triggeredOn: latestDate(streamState),
      items: kinds.map((kind) => makeSubstitution(kind, stream)),
      disclaimer: SYMPTOM_DISCLAIMER,
    })
  }

  return advice
}
