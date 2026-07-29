import type { FC } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, EmptyState, StatusPill } from '@/components'
import { useToday } from '@/hooks/useToday'
import { formatDistanceM, formatDuration } from '@/domain/units/format'
import { loadRunningRawData } from './runningData'
import { buildRunningProgressVM } from './runningViewModel'
import { WeeklyVolumeChart } from './WeeklyVolumeChart'
import { PaceByTypeChart } from './PaceByTypeChart'
import { EasyRunPaceChart } from './EasyRunPaceChart'
import { MilestoneList } from './MilestoneList'

const KM_TO_M = 1000

/**
 * Running progress (Task 26, §17): weekly volume (planned/completed/missed/
 * dropped), pace by run type, the easy-run pace trend, 5 km benchmark
 * history, longest continuous run, compromised-km pace, goal-derived
 * milestones, and trajectory toward the race date — all composed from
 * already-tested domain functions (`buildMilestoneFacts`, `goalTargets`,
 * `evaluateMilestones`, `computeTrajectory`) plus this feature's own
 * weekly-volume/pace aggregations.
 */
export const RunningProgress: FC = () => {
  const today = useToday()
  const raw = useLiveQuery(() => loadRunningRawData(today), [today])

  if (raw === undefined) return <p className="progress-screen__loading">Loading…</p>

  if (raw === null) {
    return (
      <EmptyState
        title="No plan yet"
        description="Install a training plan to see running progress here — weekly volume, pace by run type, and how you're tracking toward your goal."
      />
    )
  }

  const vm = buildRunningProgressVM(raw)

  return (
    <div className="running-progress">
      <WeeklyVolumeChart rows={vm.weeklyVolume} />
      <PaceByTypeChart rows={vm.paceByType} />
      <EasyRunPaceChart points={vm.easyRunPace} />

      <Card as="section" className="running-progress__stats">
        <h3>Durability</h3>
        <p>Longest continuous run: {formatDistanceM(Math.round(vm.longestContinuousRunKm * KM_TO_M))}</p>
        {vm.benchmarkHistory.length > 0 ? (
          <>
            <h4>5 km benchmark history</h4>
            <ul>
              {vm.benchmarkHistory.map((point, index) => (
                <li key={`${point.date}-${String(index)}`}>{point.date}: {formatDuration(point.timeSec)}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="running-progress__no-benchmark">No standalone 5 km benchmark logged yet.</p>
        )}
      </Card>

      <MilestoneList milestones={vm.milestones} />

      <Card as="section" className="running-progress__trajectory">
        <h3>Trajectory toward race day</h3>
        <StatusPill status={vm.trajectory.trajectory} />
        <p>{vm.trajectory.headline}</p>
        <ul>
          {vm.trajectory.evidence.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </Card>
    </div>
  )
}
