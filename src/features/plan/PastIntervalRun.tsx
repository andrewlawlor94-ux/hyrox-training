import type { FC } from 'react'
import { useRef, useState } from 'react'
import type { InstancePrescription, IntervalSplit, RunLog } from '@/data/types'
import { saveRunLog } from '@/data/repositories'
import { splitPaceSecPerKm } from '@/domain/pace/intervals'
import { formatDistanceM, formatDuration, formatPace } from '@/domain/units/format'
import { IntervalSplitsEditor } from '@/features/workout/IntervalSplitsEditor'
import type { DraftSplit } from '@/features/workout/IntervalSplitsEditor'
import { intervalTotals, isLoggableRun } from '@/features/workout/runTotals'
import { useAutosave } from '@/features/workout/useAutosave'

const M_PER_KM = 1000
/** The one deliberate "correct a past record" path. */
const ALLOW_HISTORY_EDIT = { allowHistoryEdit: true } as const

function toIntervalSplits(runLogId: string, drafts: readonly DraftSplit[]): IntervalSplit[] {
  return drafts.map((d) => ({
    id: `${runLogId}_sp${String(d.index)}`,
    runLogId,
    index: d.index,
    kind: d.kind,
    ...(d.distanceM !== undefined ? { distanceM: d.distanceM } : {}),
    ...(d.durationSec !== undefined ? { durationSec: d.durationSec } : {}),
    ...(splitPaceSecPerKm(d) !== null ? { paceSecPerKm: splitPaceSecPerKm(d) as number } : {}),
  }))
}

interface PastIntervalRunProps {
  prescription: InstancePrescription
  exerciseName: string
  /** The stored run, if this session ever recorded one. */
  log: RunLog | undefined
  /** Already-persisted splits for that run, in index order. */
  splits: IntervalSplit[]
  onError: (err: unknown) => void
}

/**
 * Correcting — or entering for the first time — an interval run on a COMPLETED
 * session.
 *
 * Two gaps this closes, both reported by the athlete after finishing a quality
 * session: "when i go to edit quality run i did this morning it just says no
 * logged sets runs or stations to correct on this record. I should be able to see
 * what i logged and change it."
 *
 * 1. The per-rep splits were invisible here. `PastRecordEditor` showed a run's
 *    overall distance and duration and nothing else, so the reps — the only part
 *    of an interval session anyone cares about — could be neither seen nor fixed.
 * 2. A session that recorded NOTHING was a dead end. The editor listed stored
 *    rows, so with no row there was nothing to show and no way to add one. That
 *    is the least useful moment to refuse: a session whose data went missing is
 *    exactly the session you need to re-enter, and the whole point of "edit this
 *    past record" is to fix the record.
 *
 * So this is driven by the PRESCRIPTION, not by a stored row — the reps render
 * from what the programme prescribed whether or not anything was ever saved, and
 * the first real value creates the row. The totals are derived from the splits,
 * the same one way `RunBlock` derives them (`intervalTotals`), so a correction
 * cannot leave the stored distance disagreeing with the reps it came from.
 */
export const PastIntervalRun: FC<PastIntervalRunProps> = ({ prescription, exerciseName, log, splits, onError }) => {
  const [drafts, setDrafts] = useState<DraftSplit[]>([])
  const autosave = useAutosave()
  /**
   * `IntervalSplitsEditor` reports its rows once on mount, before the athlete has
   * touched anything. That echo must not write: on a session that already has a
   * record it would rewrite frozen history identically just for opening the
   * editor, and on one that has none it could create a row nobody asked for.
   * Skipping exactly the first call is what makes opening this screen a read.
   */
  const seenMountEcho = useRef(false)
  const runLogId = log?.id ?? `rl_${prescription.id}`
  const totals = drafts.length > 0
    ? intervalTotals(drafts)
    : { distanceKm: log?.distanceKm ?? null, durationSec: log?.durationSec ?? null, workPaceSecPerKm: log?.paceSecPerKm ?? null }

  function handleSplitsChange(next: DraftSplit[]): void {
    setDrafts(next)
    if (!seenMountEcho.current) {
      seenMountEcho.current = true
      return
    }
    const merged = intervalTotals(next)
    // Half-entered reps are still refused rather than saved as a zero.
    if (!isLoggableRun(merged.distanceKm, merged.durationSec)) return

    autosave.schedule(runLogId, async () => {
      try {
        // The WORK-only mean, never session time over work distance — see
        // `RunTotals.workPaceSecPerKm` for what that mistake produced.
        const pace = merged.workPaceSecPerKm
        const runLog: RunLog = {
          id: runLogId,
          instanceId: prescription.instanceId,
          instancePrescriptionId: prescription.id,
          distanceKm: merged.distanceKm as number,
          durationSec: merged.durationSec as number,
          surface: log?.surface ?? 'road',
          runType: log?.runType ?? 'intervals',
          notes: log?.notes ?? '',
          // Kept from the original record when there is one: this is a
          // correction to a run that happened, not a new run happening now.
          loggedAt: log?.loggedAt ?? new Date().toISOString(),
          ...(pace !== null ? { paceSecPerKm: pace } : {}),
        }
        await saveRunLog(runLog, toIntervalSplits(runLogId, next), ALLOW_HISTORY_EDIT)
      } catch (err) {
        onError(err)
      }
    })
  }

  return (
    <section className="past-interval-run">
      <h4 className="past-interval-run__name">{exerciseName}</h4>
      <p className="past-interval-run__totals">
        {log === undefined
          ? 'Nothing was recorded for this run. Fill in the reps you did and they will be saved to this session.'
          /* The pace shown is the WORK pace, matching what is stored — dividing
             the session's elapsed time by the work distance reads far slower
             than anything actually run. */
          : `Recorded: ${totals.distanceKm === null ? '—' : formatDistanceM(totals.distanceKm * M_PER_KM)} · ${totals.durationSec === null ? '—' : formatDuration(totals.durationSec)} · ${formatPace(totals.workPaceSecPerKm)}`}
      </p>
      <IntervalSplitsEditor
        idPrefix={`past-run-${prescription.id}`}
        intervalSpec={prescription.intervalSpec}
        initialSplits={splits}
        onChange={handleSplitsChange}
      />
    </section>
  )
}
