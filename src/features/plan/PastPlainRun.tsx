import type { FC } from 'react'
import { useState } from 'react'
import { DurationField, NumberField } from '@/components'
import { saveRunLog } from '@/data/repositories'
import type { InstancePrescription, RunLog } from '@/data/types'
import { paceSecPerKm } from '@/domain/pace/pace'
import { formatPace } from '@/domain/units/format'
import { isLoggableRun } from '@/features/workout/runTotals'
import { useAutosave } from '@/features/workout/useAutosave'

const ALLOW_HISTORY_EDIT = { allowHistoryEdit: true } as const

interface PastPlainRunProps {
  prescription: InstancePrescription
  exerciseName: string
  log: RunLog | undefined
  onError: (err: unknown) => void
}

/**
 * A non-interval run on a COMPLETED session — correcting one, or entering it for
 * the first time.
 *
 * Driven by the PRESCRIPTION rather than by a stored row, which is the whole
 * point: "i should be able to edit that record and input data even if it wasnt
 * captured the first time". The old editor listed stored rows only, so a session
 * that logged nothing offered nothing to fix.
 *
 * `RunLog` requires both distance and duration as numbers, so there is no valid
 * partial row: the two fields are held in local state and the row is written the
 * moment they are both real (`isLoggableRun`). Clearing one afterwards leaves the
 * stored row alone rather than deleting the athlete's run — deleting history is
 * not what "correct a typo" means, and it is the one place this differs from the
 * live logging screen.
 */
export const PastPlainRun: FC<PastPlainRunProps> = ({ prescription, exerciseName, log, onError }) => {
  const [distanceKm, setDistanceKm] = useState<number | null>(log?.distanceKm ?? null)
  const [durationSec, setDurationSec] = useState<number | null>(log?.durationSec ?? null)
  const autosave = useAutosave()
  const runLogId = log?.id ?? `rl_${prescription.id}`

  function scheduleSave(next: { distanceKm: number | null; durationSec: number | null }): void {
    if (!isLoggableRun(next.distanceKm, next.durationSec)) return
    autosave.schedule(runLogId, async () => {
      try {
        const pace = paceSecPerKm(next.distanceKm as number, next.durationSec as number)
        const runLog: RunLog = {
          id: runLogId,
          instanceId: prescription.instanceId,
          instancePrescriptionId: prescription.id,
          distanceKm: next.distanceKm as number,
          durationSec: next.durationSec as number,
          surface: log?.surface ?? 'road',
          runType: log?.runType ?? 'easy',
          notes: log?.notes ?? '',
          // A correction keeps the original logging time; only a genuinely new
          // entry gets stamped now.
          loggedAt: log?.loggedAt ?? new Date().toISOString(),
          ...(pace !== null ? { paceSecPerKm: pace } : {}),
        }
        await saveRunLog(runLog, [], ALLOW_HISTORY_EDIT)
      } catch (err) {
        onError(err)
      }
    })
  }

  const pace = paceSecPerKm(distanceKm ?? 0, durationSec ?? 0)

  return (
    <section className="past-record-editor__exercise">
      <h4 className="past-record-editor__exercise-name">{exerciseName}</h4>
      <p className="past-record-editor__hint">
        {log === undefined
          ? 'Nothing was recorded for this run. Enter the distance and the time and it will be saved to this session.'
          : `Recorded pace: ${formatPace(pace)}`}
      </p>
      <div className="past-record-editor__row">
        <NumberField
          id={`past-run-distance-${prescription.id}`} label="Distance" unit="km" value={distanceKm} inputMode="decimal"
          onChange={(v) => { setDistanceKm(v); scheduleSave({ distanceKm: v, durationSec }) }}
          onBlur={() => { void autosave.flushKey(runLogId) }}
        />
        <DurationField
          id={`past-run-duration-${prescription.id}`} label="Duration" valueSec={durationSec}
          onCommit={(v) => {
            setDurationSec(v)
            scheduleSave({ distanceKm, durationSec: v })
            void autosave.flushKey(runLogId)
          }}
        />
      </div>
    </section>
  )
}
