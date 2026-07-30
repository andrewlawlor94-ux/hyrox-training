import type { FC } from 'react'
import { Card, Chip, StatusPill } from '@/components'
import { formatRaceTime } from '@/domain/units/format'
import type { GoalSnapshotVM } from './types'
import type { StatusChip } from './types'

interface GoalSnapshotCardProps {
  vm: GoalSnapshotVM
}

/** Guard for the progress bar's own arithmetic — a plan can never be zero weeks
 * long, but dividing by a bad `totalWeeks` would produce NaN in a style
 * attribute, which renders as a silently full-width bar. */
const MIN_TOTAL_WEEKS = 1
const PERCENT = 100

function planProgressPercent(currentWeek: number, totalWeeks: number): number {
  const total = Math.max(MIN_TOTAL_WEEKS, totalWeeks)
  const clamped = Math.min(Math.max(currentWeek, 0), total)
  return Math.round((clamped / total) * PERCENT)
}

/** "43 days", "Tomorrow", "Race day", "8 days ago" — a countdown an athlete
 * reads at a glance, instead of a date they have to subtract from today. */
function countdownLabel(daysToRace: number): string {
  if (daysToRace === 0) return 'Race day'
  if (daysToRace === 1) return 'Tomorrow'
  if (daysToRace < 0) return `${String(Math.abs(daysToRace))} days ago`
  return `${String(daysToRace)} days`
}

const READINESS_ROWS: { key: keyof Pick<GoalSnapshotVM, 'runningStatus' | 'strengthStatus' | 'symptomStatus'>; label: string }[] = [
  { key: 'runningStatus', label: 'Running' },
  { key: 'strengthStatus', label: 'Strength' },
  { key: 'symptomStatus', label: 'Symptoms' },
]

/**
 * Purely presentational. Never renders a predicted finishing time when
 * `vm.estimate` is `null` (D14) — `vm.insufficientDataMessage` is shown
 * instead — and when an estimate does exist it is always rendered as a
 * range, explicitly labelled an estimate, never a point value.
 *
 * Laid out to be SCANNED rather than read (athlete feedback: "the layout is
 * very text heavy"). The same facts as before, restructured:
 *
 * - The two numbers that matter most — the countdown and the target time — are
 *   a two-up hero row in large type, not two sentences beginning "Race date:".
 * - Plan position becomes a labelled progress bar. "Week 6 of 27" is a fact you
 *   have to do arithmetic on; a bar shows how far through the plan you are.
 * - The three readiness statuses become a compact grid of label + chip instead
 *   of three prose lines. Tone is still never the only signal — every chip
 *   keeps its own text, per the brief's colour-blindness rule.
 * - The trajectory evidence moves into a `<details>`. It was the bulk of the
 *   card's text and is reference material, not a headline; one tap away keeps
 *   it available without it dominating. `<details>` is native, so it stays
 *   keyboard-operable and screen-reader-announced with no custom widget.
 *
 * Deliberately no icons: the project has no icon set and inventing glyphs for
 * "shin symptoms" would be less legible than the word, not more.
 */
export const GoalSnapshotCard: FC<GoalSnapshotCardProps> = ({ vm }) => {
  const progressPercent = planProgressPercent(vm.currentWeek, vm.totalWeeks)

  return (
    <Card as="section" className="goal-snapshot-card">
      <h2>Goal snapshot</h2>

      <div className="goal-hero">
        <div className="goal-hero__item">
          <span className="goal-hero__value">{countdownLabel(vm.daysToRace)}</span>
          <span className="goal-hero__label">to race · {vm.raceDate}</span>
        </div>
        <div className="goal-hero__item">
          <span className="goal-hero__value">{formatRaceTime(vm.targetSeconds)}</span>
          <span className="goal-hero__label">target time</span>
        </div>
      </div>

      {/* The percentage lives on the bar as a real `progressbar` rather than as
          a second line of visible text. Two adjacent numbers read badly — "Week
          1 of 27" followed by "4% through the plan" ran together as "274%" — and
          a native role means assistive tech announces the progress properly
          instead of skipping an `aria-hidden` decoration. */}
      <div className="goal-progress">
        <p className="goal-progress__label">Week {vm.currentWeek} of {vm.totalWeeks}</p>
        <div
          className="goal-progress__track"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={PERCENT}
          aria-label={`Plan progress: ${String(progressPercent)}% through week ${String(vm.currentWeek)} of ${String(vm.totalWeeks)}`}
        >
          <div className="goal-progress__fill" style={{ width: `${String(progressPercent)}%` }} />
        </div>
      </div>

      <div className="goal-readiness">
        {READINESS_ROWS.map((row) => {
          const status: StatusChip = vm[row.key]
          return (
            <div key={row.key} className="goal-readiness__item">
              <span className="goal-readiness__label">{row.label}</span>
              <Chip tone={status.tone}>{status.label}</Chip>
            </div>
          )
        })}
      </div>

      <div className="goal-outlook">
        <StatusPill status={vm.trajectory} />
        {vm.estimate ? (
          <p className="goal-outlook__estimate">
            <span className="goal-outlook__range">
              {formatRaceTime(vm.estimate.lowSeconds)}–{formatRaceTime(vm.estimate.highSeconds)}
            </span>
            <span className="goal-outlook__caveat">estimated finish range — an estimate, not a prediction</span>
          </p>
        ) : (
          <p className="goal-outlook__no-estimate">{vm.insufficientDataMessage}</p>
        )}
      </div>

      <details className="goal-evidence">
        <summary className="goal-evidence__summary">Why this outlook</summary>
        <ul className="goal-evidence__list">
          {vm.explanation.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </details>
    </Card>
  )
}
