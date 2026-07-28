import type { FC } from 'react'
import { useState } from 'react'
import type { ISODate, Priority } from '@/data/types'
import { Button, Card, Chip } from '@/components'
import type { ChipTone } from '@/components'
import { CompletedEarlierSheet } from '@/features/workout/CompletedEarlierSheet'
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
  onEdit: () => void
}

/**
 * Purely presentational (§Task 24): every field comes from `useHomeData`'s
 * view model, every action is a callback prop. Renders exactly the actions
 * `vm.actions` marks true — never a button with no wired behaviour behind it.
 */
export const TodaysWorkoutCard: FC<TodaysWorkoutCardProps> = ({
  vm, today, disabled, onStart, onContinue, onCompletedEarlier, onDefer, onSkip, onEdit,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false)

  function handleConfirmCompletedEarlier(forDate: ISODate): void {
    setSheetOpen(false)
    onCompletedEarlier(forDate)
  }

  return (
    <Card as="section" className="todays-workout-card">
      <h2>Today&apos;s workout</h2>
      <p className="todays-workout-card__name">{vm.name}</p>

      {vm.phaseLabel && <p className="todays-workout-card__phase">{vm.phaseLabel}</p>}

      {vm.priority && (
        <p className="todays-workout-card__meta">
          <Chip tone={PRIORITY_TONE[vm.priority]}>{PRIORITY_LABEL[vm.priority]}</Chip>
          {vm.estMinutes !== undefined && <span> · ~{vm.estMinutes} min</span>}
        </p>
      )}

      {vm.structureLines.length > 0 && (
        <ul className="todays-workout-card__structure">
          {vm.structureLines.map((line) => <li key={line}>{line}</li>)}
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
        {vm.actions.edit && <Button variant="secondary" disabled={disabled} onClick={onEdit}>Edit</Button>}
      </div>

      <CompletedEarlierSheet
        open={sheetOpen}
        today={today}
        onClose={() => { setSheetOpen(false) }}
        onConfirm={handleConfirmCompletedEarlier}
      />
    </Card>
  )
}
