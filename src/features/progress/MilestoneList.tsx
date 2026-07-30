import type { FC } from 'react'
import { Card, StatusPill } from '@/components'
import type { MilestoneResult, MilestoneStatus } from '@/domain/milestones/evaluate'

interface MilestoneListProps {
  milestones: MilestoneResult[]
}

/** `MilestoneResult.status` maps onto the same four-value vocabulary
 * `StatusPill` already renders as coloured-AND-labelled text; `atRisk` reads
 * as `needsAttention` here rather than inventing a fifth status pill. */
const STATUS_PILL_MAP: Record<MilestoneStatus, 'ahead' | 'onTrack' | 'slightlyBehind' | 'needsAttention'> = {
  achieved: 'ahead',
  inProgress: 'onTrack',
  notStarted: 'slightlyBehind',
  atRisk: 'needsAttention',
}

/**
 * Running-relevant milestones (§17/§18) — including "5 km benchmark vs.
 * goal-derived target" (`standalone5k`) and "compromised-km pace vs. target"
 * (`compromisedKmSet`), both of which already carry a goal-derived target
 * string from `evaluateMilestones` (built off `goalTargets`, so it moves
 * with the goal automatically) — a pass/fail-with-numbers comparison, which
 * needs no chart.
 *
 * Evidence rows are a value-versus-target COMPARISON rather than a bulleted
 * sentence (athlete feedback: "the UI right now is just text/bullets"). Twelve
 * milestones each carrying a `<ul>` of "Best 5 km: 24:30 (target: 26:15)" was a
 * wall of prose; the same numbers now line up in columns, with the athlete's own
 * value emphasised and the target muted beside it. Nothing is dropped.
 *
 * The met/not-met marker is a glyph paired with visually-hidden words, never the
 * glyph alone — the same rule the rest of the app follows for tone: status is
 * always available as text and never carried by colour or symbol by itself.
 */
export const MilestoneList: FC<MilestoneListProps> = ({ milestones }) => (
  <Card as="section" className="milestone-list">
    <h3>Milestones</h3>
    {milestones.map((milestone) => (
      <div key={milestone.key} className="milestone-list__item">
        <div className="milestone-list__header">
          <span>{milestone.label}</span>
          <StatusPill status={STATUS_PILL_MAP[milestone.status]} />
        </div>
        <div className="milestone-list__evidence">
          {milestone.evidence.map((row) => (
            <div key={row.label} className="evidence-row">
              <span className={row.met ? 'evidence-row__mark evidence-row__mark--met' : 'evidence-row__mark'}>
                <span aria-hidden="true">{row.met ? '✓' : '·'}</span>
                <span className="visually-hidden">{row.met ? 'Met.' : 'Not yet met.'}</span>
              </span>
              <span className="evidence-row__label">{row.label}</span>
              <span className="evidence-row__numbers">
                <span className="evidence-row__value">{row.value}</span>
                <span className="evidence-row__target">target {row.target}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    ))}
  </Card>
)
