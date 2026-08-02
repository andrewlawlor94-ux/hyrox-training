import type { FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Chip, Sheet } from '@/components'
import type { ISODate } from '@/data/types'
import { ConflictWarningSheet } from '@/features/plan/ConflictWarningSheet'
import { useMoveWorkout } from '@/features/plan/useMoveWorkout'
import { STATUS_LABEL, STATUS_TONE } from '@/features/plan/planConstants'
import { loadSessionPreview } from './sessionPreview'

interface SessionPreviewSheetProps {
  /** `null` closes the sheet. */
  instanceId: string | null
  today: ISODate
  onClose: () => void
}

/**
 * What a session actually asks for, opened by tapping it anywhere on Home
 * (athlete: "I want to be able to click the workout and view what is planned
 * ... then in that new window there should be a button that says do today. This
 * way I have the ability to adjust and say I want to run today despite having
 * strength booked").
 *
 * "Do today" is a MOVE, not a copy: it reschedules this session onto today
 * through `useMoveWorkout`, so it inherits the §15 conflict preview — if today
 * already holds a session, or the move breaks a recovery rule, the athlete is
 * told what the conflict is and chooses. That is what makes "I'll run today
 * instead of lifting" safe rather than a way to quietly double-book a day.
 *
 * Read-only otherwise. Editing a session lives in the Plan tab's own editor; a
 * preview that also edited would be two jobs in one sheet.
 */
export const SessionPreviewSheet: FC<SessionPreviewSheetProps> = ({ instanceId, today, onClose }) => {
  const navigate = useNavigate()
  const preview = useLiveQuery(
    async () => (instanceId === null ? undefined : loadSessionPreview(instanceId, today)),
    [instanceId, today],
  )

  const move = useMoveWorkout({
    instanceId: instanceId ?? undefined,
    today,
    onMoved: onClose,
  })

  return (
    <>
      <Sheet open={instanceId !== null} onClose={onClose} title={preview?.name ?? 'Session'}>
        {preview === undefined ? <p>Loading…</p> : (
          <div className="session-preview">
            <div className="session-preview__meta">
              <Chip tone={STATUS_TONE[preview.status]}>{STATUS_LABEL[preview.status]}</Chip>
              {preview.estMinutes !== undefined && <Chip tone="neutral">~{preview.estMinutes} min</Chip>}
              <Chip tone="neutral">Week {preview.weekNumber}</Chip>
            </div>
            <p className="session-preview__when">
              {preview.isToday ? 'Scheduled for today' : `Scheduled ${preview.scheduledDate}`}
              {preview.phaseLabel && ` · ${preview.phaseLabel}`}
            </p>

            {preview.structure.length === 0 ? (
              <p className="session-preview__empty">This session has no exercises prescribed yet.</p>
            ) : (
              <ul className="session-preview__structure">
                {preview.structure.map((item) => (
                  <li key={`${item.name}-${item.detail}`} className="exercise-row">
                    <span className="exercise-row__name">{item.name}</span>
                    {item.detail && <span className="exercise-row__detail">{item.detail}</span>}
                  </li>
                ))}
              </ul>
            )}

            <div className="session-preview__actions">
              {/* Frozen sessions are completed history: neither startable nor
                  movable, so neither control is offered rather than offered and
                  then refused. */}
              {!preview.frozen && preview.isToday && (
                <Button onClick={() => { void navigate(`/workout/${preview.instanceId}`) }}>Start</Button>
              )}
              {!preview.frozen && !preview.isToday && (
                <Button
                  disabled={move.isBusy}
                  onClick={() => { move.request(today).catch(() => {}) }}
                >
                  Do today
                </Button>
              )}
            </div>
            {move.error && <p role="alert" className="session-preview__error">{move.error}</p>}
          </div>
        )}
      </Sheet>

      {/* Outside the Sheet: this warning must survive the preview closing after a
          successful move, and nesting it would tie its lifetime to the sheet. */}
      <ConflictWarningSheet
        open={move.conflicts !== null}
        conflicts={move.conflicts ?? []}
        onProceed={() => { move.proceed().catch(() => {}) }}
        onPickAnotherDay={move.cancel}
      />
    </>
  )
}
