import type { SymptomStream } from '@/domain/types'
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
  /** Always appended to every card by the UI. */
  disclaimer: string
}

/** Copy for each kind, independent of which stream triggered it — the
 * `stream` field on the produced Substitution records the attribution. */
const CONTENT: Record<SubstitutionKind, { title: string; detail: string }> = {
  reduceImpactVolume: {
    title: 'Reduce impact volume',
    detail: 'Cut running and other high-impact volume by 20-30% this week to let symptoms settle before pushing again.',
  },
  swapHardRunForLowImpact: {
    title: 'Swap a hard run for low-impact cardio',
    detail: 'Replace one hard run this week with an easy SkiErg or rowing session, so aerobic volume holds up without the impact.',
  },
  maintainCalfTibialis: {
    title: 'Keep up calf and tibialis strengthening',
    detail: 'Add or maintain calf-raise and tibialis-anterior strengthening work — it is the main lever for shin resilience.',
  },
  holdLoadProgression: {
    title: 'Hold load progression',
    detail: 'Keep barbell and station loads where they are for now rather than progressing, until symptoms settle back to green.',
  },
  seekAssessment: {
    title: 'Consider a professional assessment',
    detail: 'Pain that is persistent, worsening, or focal (concentrated in one spot) is worth having assessed by a physio or sports-medicine clinician.',
  },
  stopAggravatingExercise: {
    title: 'Stop the aggravating exercise',
    detail: 'For sciatic pain that is worsening, radiating, or comes with weakness or numbness, stop whatever exercise aggravates it and seek clinical assessment rather than pushing through.',
  },
}

function makeSubstitution(kind: SubstitutionKind, stream: SymptomStream): Substitution {
  return { kind, stream, ...CONTENT[kind], disclaimer: SYMPTOM_DISCLAIMER }
}

/**
 * Builds the substitution list for a single stream, deduplicating by kind
 * within that stream (a stream can independently qualify for the same kind
 * via more than one rule — e.g. sciatic 'seekAssessment' from both the
 * persistence rule and the sciatic-elevated rule below).
 */
function buildForStream(stream: SymptomStream, streamState: StreamState): Substitution[] {
  const kinds: SubstitutionKind[] = []

  const elevatedOrSpike = streamState.level === 'elevated' || streamState.spikeFlag
  if (elevatedOrSpike) {
    kinds.push('reduceImpactVolume', 'holdLoadProgression')
    if (stream === 'shin') kinds.push('swapHardRunForLowImpact', 'maintainCalfTibialis')
  }

  if (streamState.persistenceFlag) kinds.push('seekAssessment')

  // Worsening, radiating sciatic pain, weakness, or numbness: stop the
  // aggravating exercise and seek clinical assessment. Sciatic-specific —
  // shin pain never triggers stopping an exercise outright.
  if (stream === 'sciatic' && streamState.level === 'elevated') {
    kinds.push('stopAggravatingExercise', 'seekAssessment')
  }

  const seen = new Set<SubstitutionKind>()
  const result: Substitution[] = []
  for (const kind of kinds) {
    if (seen.has(kind)) continue
    seen.add(kind)
    result.push(makeSubstitution(kind, stream))
  }
  return result
}

/** Training-load substitutions suggested by the current symptom state. Never
 * a diagnosis — every item carries `SYMPTOM_DISCLAIMER` verbatim. */
export function suggestSubstitutions(state: SymptomState): Substitution[] {
  return [...buildForStream('shin', state.shin), ...buildForStream('sciatic', state.sciatic)]
}
