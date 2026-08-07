import type { FC } from 'react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, EmptyState } from '@/components'
import { useToday } from '@/hooks/useToday'
import { useSettings } from '@/hooks/useSettings'
import { useQueue } from '@/hooks/useQueue'
import type { ISODate } from '@/data/types'
import {
  completeWorkoutEarlier, deferWorkout, listSymptomLogs, skipWorkout, syncQueue, updateSettings,
} from '@/data/repositories'
import { evaluateSymptoms } from '@/domain/symptoms/evaluate'
import { buildSymptomAdvice } from '@/domain/symptoms/substitutions'
import { urgentRedFlagMessage } from '@/domain/symptoms/redFlags'
import { dismissalKey, sessionsForStream } from '@/features/symptoms/affectedInstances'
import { SubstitutionCard } from '@/features/symptoms/SubstitutionCard'
import { useHomeData } from './useHomeData'
import { TodaysWorkoutCard } from './TodaysWorkoutCard'
import { ThisWeekCard } from './ThisWeekCard'
import { GoalSnapshotCard } from './GoalSnapshotCard'
import { SessionPreviewSheet } from './SessionPreviewSheet'

function logAndIgnore(err: unknown): void {
  console.error('Home action failed', err)
}

/**
 * The real Home screen (Task 24): today's workout, this week's status, and
 * the goal snapshot, in that DOM order, backed by `useHomeData`. The Task
 * 18/19 urgent-red-flag card and `SubstitutionCard`s (Task 23) are preserved
 * unchanged, wired from their own `useQueue`/`useSettings` reads exactly as
 * before — neither one ever changes an instance's `scheduledDate`/`status`
 * on its own, and neither depends on an active `Plan` row existing (some
 * older fixtures author `WorkoutInstance` rows directly without one), so
 * they render independently of whether `useHomeData` has a plan to show.
 */
export const HomeScreen: FC = () => {
  const today = useToday()
  const navigate = useNavigate()
  const queue = useQueue(today)
  const settings = useSettings()
  const homeData = useHomeData(today)
  const [disabled, setDisabled] = useState(false)
  // Which session's preview is open. Owned here rather than per card, because
  // both Today's workout and This week open the same sheet.
  const [previewInstanceId, setPreviewInstanceId] = useState<string | null>(null)
  const inFlight = useRef(false)

  const symptomState = useLiveQuery(async () => {
    const logs = await listSymptomLogs()
    return evaluateSymptoms(logs, today)
  }, [today])

  async function runOnce(action: () => Promise<void>): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setDisabled(true)
    try {
      await action()
    } catch (err) {
      logAndIgnore(err)
    } finally {
      inFlight.current = false
      setDisabled(false)
    }
  }

  function handleStart(): void {
    const id = homeData?.today.instance?.id
    if (id) void navigate(`/workout/${id}`)
  }

  function handleCompletedEarlier(forDate: ISODate): void {
    const id = homeData?.today.instance?.id
    if (!id) return
    void runOnce(async () => {
      await completeWorkoutEarlier({ id, forDate, now: new Date().toISOString() })
      await syncQueue(today)
    })
  }

  function handleDefer(): void {
    const id = homeData?.today.instance?.id
    if (!id) return
    void runOnce(async () => {
      await deferWorkout({ id, now: new Date().toISOString() })
      await syncQueue(today)
    })
  }

  function handleSkip(): void {
    const id = homeData?.today.instance?.id
    if (!id) return
    void runOnce(async () => {
      await skipWorkout({ id, now: new Date().toISOString() })
      await syncQueue(today)
    })
  }

  if (queue === undefined || settings === undefined) return <p className="home-screen__loading">Loading…</p>

  // At most one card per symptom stream, so two at the very most — this used
  // to be one card per suggestion per affected session across the whole
  // remaining plan, which ran to hundreds.
  const advice = (symptomState ? buildSymptomAdvice(symptomState) : [])
    .filter((entry) => !settings.dismissedSubstitutions.includes(dismissalKey(entry)))

  return (
    <div className="home-screen">
      <h1 className="home-screen__heading">Home</h1>

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

      {homeData === undefined ? (
        <p className="home-screen__loading">Loading…</p>
      ) : !homeData.hasPlan ? (
        <EmptyState
          title="No plan yet"
          description="Finish onboarding to install a training plan and see today's workout here."
          action={<Button onClick={() => { void navigate('/onboarding') }}>Go to onboarding</Button>}
        />
      ) : (
        <>
          <TodaysWorkoutCard
            vm={homeData.today}
            today={today}
            disabled={disabled}
            onStart={handleStart}
            onContinue={handleStart}
            onCompletedEarlier={handleCompletedEarlier}
            onDefer={handleDefer}
            onSkip={handleSkip}
            onSelectSession={setPreviewInstanceId}
          />
          {homeData.week && <ThisWeekCard vm={homeData.week} onSelectSession={setPreviewInstanceId} />}
          {homeData.goal && <GoalSnapshotCard vm={homeData.goal} />}
        </>
      )}

      <SessionPreviewSheet
        instanceId={previewInstanceId}
        today={today}
        onClose={() => { setPreviewInstanceId(null) }}
      />

      {advice.map((entry) => (
        <SubstitutionCard
          key={entry.stream}
          advice={entry}
          sessions={sessionsForStream(queue.instances, entry.stream, today)}
        />
      ))}
    </div>
  )
}
