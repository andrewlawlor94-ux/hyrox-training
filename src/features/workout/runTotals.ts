import { summarizeSplits } from '@/domain/pace/intervals'
import { isPositiveFinite } from '@/domain/pace/pace'
import type { DraftSplit } from './IntervalSplitsEditor'

const M_PER_KM = 1000

export interface RunTotals {
  distanceKm: number | null
  durationSec: number | null
}

/**
 * A `RunLog` is only ever a genuinely asserted run — `distanceKm`/`durationSec`
 * are required numbers, unlike `StationLog`'s optional measurement fields — so
 * "loggable" means both are actually present *and* positive-finite, not merely
 * non-null. `distanceKm === null || durationSec === null` alone is exactly the
 * assertion-blind-to-validity shape this project keeps re-introducing
 * (I1/I2/I3): it happily accepts 0 or a negative value as "present enough".
 */
export function isLoggableRun(distanceKm: number | null, durationSec: number | null): boolean {
  return distanceKm !== null && durationSec !== null && isPositiveFinite(distanceKm) && isPositiveFinite(durationSec)
}

/**
 * An interval session's own totals, added up from its splits.
 *
 * For an interval run the splits ARE the run: the reps plus a warm-up and a
 * cool-down is the whole session, and its distance and duration are the sums of
 * those parts. Asking for them a second time in separate top-level boxes gave the
 * athlete two places to type the same fact and no way to tell which one counted —
 * and because the top-level duration was the one `isLoggableRun` checked, a
 * fully-filled quality session with that box left blank saved NOTHING.
 *
 * Only reps the athlete actually recorded reach this function; `buildDraftSplits`
 * drops the rest, so a 4 × 1000 m session with two reps run totals 2 km rather
 * than the 4 km sitting prefilled on screen.
 *
 * Returns `null` for a total that is not yet a real number, so a half-entered
 * session is still refused rather than saved as a zero.
 *
 * Shared by the live logging screen (`RunBlock`) and the past-record corrector
 * (`PastIntervalRun`) so a session's totals are computed one way, not two.
 */
export function intervalTotals(drafts: readonly DraftSplit[]): RunTotals {
  const summary = summarizeSplits([...drafts])
  return {
    distanceKm: summary.totalSessionDistanceM > 0 ? summary.totalSessionDistanceM / M_PER_KM : null,
    durationSec: summary.totalSessionDurationSec > 0 ? summary.totalSessionDurationSec : null,
  }
}
