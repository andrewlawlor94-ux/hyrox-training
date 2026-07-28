import type { FC } from 'react'
import { Card, EmptyState } from '@/components'
import { useToday } from '@/hooks/useToday'
import { useQueue } from '@/hooks/useQueue'

/**
 * Deliberately minimal for Task 18/19: the full dashboard (session names,
 * actions, the rest-timer/active-workout bars) is Task 24's job. This is
 * the smallest HONEST screen that can sit behind the "Home" nav tab today —
 * real data from `useQueue`, not a "coming soon" placeholder — so the tab
 * isn't a dead link while it waits to be built out. See the Task 18 report.
 */
export const HomeScreen: FC = () => {
  const today = useToday()
  const queue = useQueue(today)

  if (queue === undefined) return <p className="home-screen__loading">Loading…</p>

  const todaysInstances = queue.instances.filter((instance) => instance.scheduledDate === today)

  return (
    <div className="home-screen">
      <h1 className="home-screen__heading">Home</h1>
      <p className="home-screen__date">{today}</p>
      {todaysInstances.length === 0 ? (
        <EmptyState
          title="Nothing scheduled today"
          description="Once a plan is installed, today's sessions will show up here."
        />
      ) : (
        <ul className="home-screen__list">
          {todaysInstances.map((instance) => (
            <li key={instance.id}>
              <Card>
                <p className="home-screen__slot">Session {instance.sessionSlot}</p>
                <p className="home-screen__status">{instance.status}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
