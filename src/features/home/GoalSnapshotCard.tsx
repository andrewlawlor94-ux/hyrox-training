import type { FC } from 'react'
import { Card, Chip, StatusPill } from '@/components'
import { formatRaceTime } from '@/domain/units/format'
import type { GoalSnapshotVM } from './types'

interface GoalSnapshotCardProps {
  vm: GoalSnapshotVM
}

/**
 * Purely presentational. Never renders a predicted finishing time when
 * `vm.estimate` is `null` (D14) — `vm.insufficientDataMessage` is shown
 * instead — and when an estimate does exist it is always rendered as a
 * range, explicitly labelled an estimate, never a point value.
 */
export const GoalSnapshotCard: FC<GoalSnapshotCardProps> = ({ vm }) => (
  <Card as="section" className="goal-snapshot-card">
    <h2>Goal snapshot</h2>
    <p className="goal-snapshot-card__race-date">Race date: {vm.raceDate}</p>
    <p className="goal-snapshot-card__target">Target time: {formatRaceTime(vm.targetSeconds)}</p>
    <p className="goal-snapshot-card__week">Plan week {vm.currentWeek} of {vm.totalWeeks}</p>

    <p className="goal-snapshot-card__running">
      Running milestones: <Chip tone={vm.runningStatus.tone}>{vm.runningStatus.label}</Chip>
    </p>
    <p className="goal-snapshot-card__strength">
      Strength maintenance: <Chip tone={vm.strengthStatus.tone}>{vm.strengthStatus.label}</Chip>
    </p>
    <p className="goal-snapshot-card__symptoms">
      Recent symptoms: <Chip tone={vm.symptomStatus.tone}>{vm.symptomStatus.label}</Chip>
    </p>

    <p className="goal-snapshot-card__trajectory">
      <StatusPill status={vm.trajectory} />
    </p>

    <ul className="goal-snapshot-card__evidence">
      {vm.explanation.map((line) => <li key={line}>{line}</li>)}
    </ul>

    {vm.estimate ? (
      <p className="goal-snapshot-card__estimate">
        Estimated finish range: {formatRaceTime(vm.estimate.lowSeconds)}–{formatRaceTime(vm.estimate.highSeconds)}
        {' '}(an estimate, not a prediction)
      </p>
    ) : (
      <p className="goal-snapshot-card__no-estimate">{vm.insufficientDataMessage}</p>
    )}
  </Card>
)
