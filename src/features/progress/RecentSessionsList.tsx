import type { FC } from 'react'
import { Card } from '@/components'
import { formatLoad } from '@/domain/units/format'
import type { SessionPerformance, SetPerformance } from '@/domain/strength/oneRepMax'

interface RecentSessionsListProps {
  sessions: SessionPerformance[]
}

function formatSet(set: SetPerformance): string {
  const load = formatLoad({ value: set.weight, unit: set.unit })
  const rir = set.rir !== undefined ? ` @ RIR ${String(set.rir)}` : ''
  return `${load} x ${String(set.reps)}${rir}`
}

/** Most-recent-first list of logged sessions, each set shown as weight x
 * reps @ RIR (§17) — no chart needed here, a session's own numbers already
 * are the compact form. */
export const RecentSessionsList: FC<RecentSessionsListProps> = ({ sessions }) => (
  <Card as="section" className="recent-sessions-list">
    <h3>Recent sessions</h3>
    <ul>
      {sessions.map((session, index) => (
        <li key={`${session.date}-${String(index)}`} className="recent-sessions-list__row">
          <p className="recent-sessions-list__date">{session.date}</p>
          <p className="recent-sessions-list__sets">{session.sets.map(formatSet).join(', ')}</p>
        </li>
      ))}
    </ul>
  </Card>
)
