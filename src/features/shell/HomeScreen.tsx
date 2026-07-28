import type { FC } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, EmptyState } from '@/components'
import { useToday } from '@/hooks/useToday'
import { useSettings } from '@/hooks/useSettings'
import { useQueue } from '@/hooks/useQueue'
import { listSymptomLogs, updateSettings } from '@/data/repositories'
import { evaluateSymptoms } from '@/domain/symptoms/evaluate'
import { suggestSubstitutions } from '@/domain/symptoms/substitutions'
import { urgentRedFlagMessage } from '@/domain/symptoms/redFlags'
import { affectedInstances } from '@/features/symptoms/affectedInstances'
import { SubstitutionCard } from '@/features/symptoms/SubstitutionCard'

function logAndIgnore(err: unknown): void {
  console.error('Home action failed', err)
}

/**
 * Deliberately minimal for Task 18/19: the full dashboard (session names,
 * actions, the rest-timer/active-workout bars) is Task 24's job. This is
 * the smallest HONEST screen that can sit behind the "Home" nav tab today —
 * real data from `useQueue`, not a "coming soon" placeholder — so the tab
 * isn't a dead link while it waits to be built out. See the Task 18 report.
 *
 * Task 23 adds two safety-adjacent surfaces on top of that: the urgent
 * red-flag card (persists here until dismissed — it is never auto-cleared
 * by anything else) and `SubstitutionCard`s for upcoming sessions affected
 * by elevated symptoms. Neither ever changes an instance's `scheduledDate`
 * or `status` on its own — no workout is auto-cancelled by symptoms.
 */
export const HomeScreen: FC = () => {
  const today = useToday()
  const queue = useQueue(today)
  const settings = useSettings()
  const symptomState = useLiveQuery(async () => {
    const logs = await listSymptomLogs()
    return evaluateSymptoms(logs, today)
  }, [today])

  if (queue === undefined || settings === undefined) return <p className="home-screen__loading">Loading…</p>

  const todaysInstances = queue.instances.filter((instance) => instance.scheduledDate === today)
  const substitutions = symptomState ? suggestSubstitutions(symptomState) : []
  const affected = affectedInstances(queue.instances, substitutions, settings.dismissedSubstitutions)

  return (
    <div className="home-screen">
      <h1 className="home-screen__heading">Home</h1>
      <p className="home-screen__date">{today}</p>

      {settings.urgentRedFlagAt != null && (
        <Card className="home-screen__urgent-card">
          <p className="home-screen__urgent-text" role="alert">{urgentRedFlagMessage()}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { updateSettings({ urgentRedFlagAt: null }).catch(logAndIgnore) }}
          >
            Dismiss
          </Button>
        </Card>
      )}

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

      {affected.map(({ instance, substitution }) => (
        <SubstitutionCard key={`${instance.id}:${substitution.kind}`} instanceId={instance.id} substitution={substitution} />
      ))}
    </div>
  )
}
