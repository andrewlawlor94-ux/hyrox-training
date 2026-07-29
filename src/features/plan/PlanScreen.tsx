import type { FC } from 'react'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, EmptyState, Sheet } from '@/components'
import { useToday } from '@/hooks/useToday'
import { PlanManager } from './PlanManager'
import { loadPlanOverview } from './planData'
import { WeekDetail } from './WeekDetail'
import { WeekList } from './WeekList'

/**
 * The Plan tab: a week-by-week browser over the active plan (§14), plus
 * "Manage plans" for plan-level operations (`PlanManager`). Reads via
 * `useLiveQuery(loadPlanOverview)`, which only ever reads — safe per this
 * project's read-that-writes rule.
 */
export const PlanScreen: FC = () => {
  const today = useToday()
  const overview = useLiveQuery(() => loadPlanOverview())
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [managerOpen, setManagerOpen] = useState(false)

  if (overview === undefined) return <p className="route-loading">Loading…</p>

  if (!overview) {
    return (
      <div className="plan-screen">
        <h1>Plan</h1>
        <EmptyState title="No active plan yet" description="Finish onboarding to install a training plan." />
      </div>
    )
  }

  const currentWeek = overview.weeks.find((w) => w.sessions.some((s) => s.scheduledDate === today))
  const selected = selectedWeek !== null ? overview.weeks.find((w) => w.weekNumber === selectedWeek) : undefined

  return (
    <div className="plan-screen">
      <div className="plan-screen__header">
        <h1>Plan</h1>
        <Button variant="secondary" size="sm" onClick={() => { setManagerOpen(true) }}>Manage plans</Button>
      </div>

      {!selected && (
        <WeekList weeks={overview.weeks} currentWeekNumber={currentWeek?.weekNumber ?? null} onSelect={setSelectedWeek} />
      )}

      {selected && (
        <WeekDetail planId={overview.planId} week={selected} today={today} onBack={() => { setSelectedWeek(null) }} />
      )}

      <Sheet open={managerOpen} onClose={() => { setManagerOpen(false) }} title="Manage plans">
        <PlanManager today={today} onClose={() => { setManagerOpen(false) }} />
      </Sheet>
    </div>
  )
}
