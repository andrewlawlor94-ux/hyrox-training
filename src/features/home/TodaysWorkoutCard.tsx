import type { FC } from 'react'
import { useState } from 'react'
import type { ISODate, Priority } from '@/data/types'
import { Button, Card, Chip } from '@/components'
import type { ChipTone } from '@/components'
import { CompletedEarlierSheet } from '@/features/workout/CompletedEarlierSheet'
import { EditPrescriptionSheet } from '@/features/workout/EditPrescriptionSheet'
import type { TodaysWorkoutVM } from './types'

const PRIORITY_TONE: Record<Priority, ChipTone> = { essential: 'accent', important: 'neutral', optional: 'neutral' }
const PRIORITY_LABEL: Record<Priority, string> = { essential: 'Essential', important: 'Important', optional: 'Optional' }

interface TodaysWorkoutCardProps {
  vm: TodaysWorkoutVM
  today: ISODate
  disabled: boolean
  onStart: () => void
  onContinue: () => void
  onCompletedEarlier: (forDate: ISODate) => void
  onDefer: () => void
  onSkip: () => void
}

/**
 * Purely presentational (§Task 24): every field comes from `useHomeData`'s
 * view model, every action is a callback prop -- except Edit, which opens
 * `EditPrescriptionSheet` right here rather than delegating to a parent
 * callback. Editing today's prescriptions doesn't navigate anywhere (unlike
 * Start/Continue, which hand off to the real workout screen), so it owns its
 * own sheet state the same way the "Completed earlier" flow already does.
 * Renders exactly the actions `vm.actions` marks true — never a button with
 * no wired behaviour behind it.
 */
export const TodaysWorkoutCard: FC<TodaysWorkoutCardProps> = ({
  vm, today, disabled, onStart, onContinue, onCompletedEarlier, onDefer, onSkip,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  function handleConfirmCompletedEarlier(forDate: ISODate): void {
    setSheetOpen(false)
    onCompletedEarlier(forDate)
  }

  return (
    <Card as="section" className="todays-workout-card">
      <h2>Today&apos;s workout</h2>
      <p className="todays-workout-card__name">{vm.name}</p>

      {vm.phaseLabel && <p className="todays-workout-card__phase">{vm.phaseLabel}</p>}

      {/* Priority, duration and exercise count as chips on one line, rather than
          a chip followed by "· ~45 min" in loose prose. */}
      {(vm.priority !== undefined || vm.estMinutes !== undefined) && (
        <div className="todays-workout-card__meta">
          {vm.priority && <Chip tone={PRIORITY_TONE[vm.priority]}>{PRIORITY_LABEL[vm.priority]}</Chip>}
          {vm.estMinutes !== undefined && <Chip tone="neutral">~{vm.estMinutes} min</Chip>}
          {vm.structure.length > 0 && (
            <Chip tone="neutral">
              {vm.structure.length} {vm.structure.length === 1 ? 'exercise' : 'exercises'}
            </Chip>
          )}
        </div>
      )}

      {/* Exercise and dose as aligned columns — "Back squat  4 x 5" reads down
          the page far faster than a list of "Back squat: 4 x 5" sentences. */}
      {vm.structure.length > 0 && (
        <ul className="todays-workout-card__structure">
          {vm.structure.map((item) => (
            <li key={`${item.name}-${item.detail}`} className="exercise-row">
              <span className="exercise-row__name">{item.name}</span>
              {item.detail && <span className="exercise-row__detail">{item.detail}</span>}
            </li>
          ))}
        </ul>
      )}

      {vm.reason && <p className="todays-workout-card__reason">{vm.reason}</p>}

      {vm.adjustmentReason && (
        <p className="todays-workout-card__adjustment" role="note">{vm.adjustmentReason}</p>
      )}

      {vm.symptomCaution && (
        <p className="todays-workout-card__caution" role="alert">{vm.symptomCaution}</p>
      )}

      {vm.kind === 'allDoneToday' && vm.nextUpcomingName && (
        <p className="todays-workout-card__next">Next up: {vm.nextUpcomingName}</p>
      )}

      <div className="todays-workout-card__actions">
        {vm.actions.start && <Button disabled={disabled} onClick={onStart}>Start</Button>}
        {vm.actions.continue && <Button disabled={disabled} onClick={onContinue}>Continue</Button>}
        {vm.actions.completedEarlier && (
          <Button variant="secondary" disabled={disabled} onClick={() => { setSheetOpen(true) }}>Completed earlier</Button>
        )}
        {vm.actions.defer && <Button variant="quiet" disabled={disabled} onClick={onDefer}>Defer</Button>}
        {vm.actions.skip && <Button variant="quiet" disabled={disabled} onClick={onSkip}>Skip</Button>}
        {vm.actions.edit && (
          <Button variant="secondary" disabled={disabled} onClick={() => { setEditOpen(true) }}>Edit</Button>
        )}
      </div>

      <CompletedEarlierSheet
        open={sheetOpen}
        today={today}
        onClose={() => { setSheetOpen(false) }}
        onConfirm={handleConfirmCompletedEarlier}
      />
      {vm.instance && (
        <EditPrescriptionSheet
          open={editOpen}
          instanceId={vm.instance.id}
          onClose={() => { setEditOpen(false) }}
        />
      )}
    </Card>
  )
}
