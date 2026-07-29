import type { FC } from 'react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ISODate, WorkoutInstance } from '@/data/types'
import {
  completeWorkout, completeWorkoutEarlier, deferWorkout, listSymptomLogs, saveSymptomLog, skipWorkout, syncQueue, updateSettings,
} from '@/data/repositories'
import { evaluateSymptoms } from '@/domain/symptoms/evaluate'
import type { RedFlagAnswers } from '@/domain/symptoms/redFlags'
import { hasUrgentRedFlag } from '@/domain/symptoms/redFlags'
import { RED_FLAG_SCREEN_SCIATIC_MIN } from '@/domain/symptoms/constants'
import { RedFlagScreen } from '@/features/symptoms/RedFlagScreen'
import { useAutosaveScope } from './autosaveScope'
import { CompletedEarlierSheet } from './CompletedEarlierSheet'
import { CompletionActions } from './CompletionActions'
import type { SymptomValues } from './SymptomCapture'
import { SymptomCapture } from './SymptomCapture'

const BLANK_RED_FLAG_ANSWERS: RedFlagAnswers = { bowelBladder: false, saddleNumbness: false, progressiveWeakness: false }

interface WorkoutFooterProps {
  instance: WorkoutInstance
  today: ISODate
}

/**
 * Ends a workout session (§8/§16): symptom capture, the red-flag screen
 * (shown only when warranted), and all five completion states. Every
 * completion path runs through `runOnce`, which guards with an in-flight
 * ref FIRST (synchronous, before any state update lands) so a double-tap can
 * never start the write twice — `CompletionActions`' native `disabled` is
 * the second, defence-in-depth layer, not the only one.
 */
export const WorkoutFooter: FC<WorkoutFooterProps> = ({ instance, today }) => {
  const navigate = useNavigate()
  const [values, setValues] = useState<SymptomValues>({ sessionRpe: 0, shinPain: 0, sciaticPain: 0 })
  const [redFlagAnswers, setRedFlagAnswers] = useState<RedFlagAnswers>(BLANK_RED_FLAG_ANSWERS)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [disabled, setDisabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const autosaveScope = useAutosaveScope()

  // Pure read (safe inside useLiveQuery): whether the SCIATIC STREAM itself
  // is already flagged from history, independent of today's live entry —
  // see `evaluate.ts`'s `needsRedFlagScreen`.
  const historyFlag = useLiveQuery(async () => {
    const logs = await listSymptomLogs()
    return evaluateSymptoms(logs, today).needsRedFlagScreen
  }, [today])
  const showRedFlag = values.sciaticPain >= RED_FLAG_SCREEN_SCIATIC_MIN || (historyFlag ?? false)

  function handleRedFlagChange(id: keyof RedFlagAnswers, value: boolean): void {
    const next = { ...redFlagAnswers, [id]: value }
    setRedFlagAnswers(next)
    if (hasUrgentRedFlag(next)) void updateSettings({ urgentRedFlagAt: new Date().toISOString() })
  }

  async function saveSymptoms(): Promise<void> {
    await saveSymptomLog({
      id: `sym_${instance.id}`, instanceId: instance.id, forDate: today,
      sessionRpe: values.sessionRpe, shinPain: values.shinPain, sciaticPain: values.sciaticPain, notes: '',
      loggedAt: new Date().toISOString(),
    })
  }

  async function runOnce(action: () => Promise<void>): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setDisabled(true)
    setError(null)
    try {
      // Land every still-debounced field edit BEFORE the completion write, which
      // sets `frozen: true`. A pending `upsertSet` firing after that throws
      // `HistoryImmutableError` and the athlete's last weight/reps silently
      // vanish -- blur alone is not enough, since its flush is fire-and-forget
      // and races the tap that triggered it.
      await autosaveScope?.flushAll()
      await action()
      void navigate('/')
    } catch (err) {
      // Surfaced, not just logged: if ending the session failed, the athlete
      // is about to walk away believing it was saved.
      console.error('Workout completion failed', err)
      setError(err instanceof Error ? err.message : 'Could not save this session. Try again.')
    } finally {
      inFlight.current = false
      setDisabled(false)
    }
  }

  function handleComplete(): void {
    void runOnce(async () => {
      await saveSymptoms()
      await completeWorkout({ id: instance.id, state: 'completed', forDate: today, now: new Date().toISOString() })
      await syncQueue(today)
    })
  }

  function handlePartial(): void {
    void runOnce(async () => {
      await saveSymptoms()
      await completeWorkout({ id: instance.id, state: 'partiallyCompleted', forDate: today, now: new Date().toISOString() })
      await syncQueue(today)
    })
  }

  function handleCompletedEarlier(forDate: ISODate): void {
    setSheetOpen(false)
    void runOnce(async () => {
      await saveSymptoms()
      await completeWorkoutEarlier({ id: instance.id, forDate, now: new Date().toISOString() })
      await syncQueue(today)
    })
  }

  function handleDefer(): void {
    void runOnce(async () => {
      await deferWorkout({ id: instance.id, now: new Date().toISOString() })
      await syncQueue(today)
    })
  }

  function handleSkip(): void {
    void runOnce(async () => {
      await skipWorkout({ id: instance.id, now: new Date().toISOString() })
      await syncQueue(today)
    })
  }

  return (
    <div className="workout-footer">
      <SymptomCapture idPrefix={`symptom-${instance.id}`} values={values} onChange={(patch) => { setValues((v) => ({ ...v, ...patch })) }} />
      {showRedFlag && <RedFlagScreen answers={redFlagAnswers} onChange={handleRedFlagChange} />}
      <CompletionActions
        disabled={disabled}
        onComplete={handleComplete}
        onPartial={handlePartial}
        onCompletedEarlier={() => { setSheetOpen(true) }}
        onDefer={handleDefer}
        onSkip={handleSkip}
      />
      {error && <p role="alert" className="workout-footer__error">{error}</p>}
      <CompletedEarlierSheet open={sheetOpen} today={today} onClose={() => { setSheetOpen(false) }} onConfirm={handleCompletedEarlier} />
    </div>
  )
}
