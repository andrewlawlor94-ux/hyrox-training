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
 * with the goal automatically) — plain evidence rows, no chart needed for a
 * pass/fail-with-numbers comparison.
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
        <ul className="milestone-list__evidence">
          {milestone.evidence.map((row) => (
            <li key={row.label}>{row.label}: {row.value} (target: {row.target})</li>
          ))}
        </ul>
      </div>
    ))}
  </Card>
)
