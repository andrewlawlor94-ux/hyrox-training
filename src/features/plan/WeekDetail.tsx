import type { FC } from 'react'
import { useState } from 'react'
import { Button, Chip, EmptyState, Sheet } from '@/components'
import { addWorkoutToWeek, swapWorkoutOrder, syncQueue } from '@/data/repositories'
import type { Priority, WorkoutKind } from '@/data/types'
import type { WeekSummary } from './planData'
import { PRIORITY_OPTIONS, STATUS_LABEL, STATUS_TONE, WORKOUT_KIND_OPTIONS } from './planConstants'
import { WorkoutEditor } from './WorkoutEditor'

interface WeekDetailProps {
  planId: string
  week: WeekSummary
  today: string
  onBack: () => void
}

const KIND_LABEL: Record<WorkoutKind, string> = Object.fromEntries(WORKOUT_KIND_OPTIONS.map((o) => [o.value, o.label])) as Record<WorkoutKind, string>

interface NewWorkoutForm {
  name: string
  kind: WorkoutKind
  priority: Priority
  estMinutes: string
}

const EMPTY_FORM: NewWorkoutForm = { name: '', kind: 'strength', priority: 'important', estMinutes: '45' }

/**
 * One week's session list: compact rows (name + kind/status chips + move-up/
 * move-down), an "Add workout" sheet, and "Edit" opening `WorkoutEditor` for
 * everything else (rename/priority/notes, move date, duplicate, delete,
 * exercises). Reordering is two real buttons — no drag — so it's keyboard
 * reachable; a row disables Up/Down when it or its neighbour is frozen
 * (completed) rather than attempting a swap the guard would reject.
 */
export const WeekDetail: FC<WeekDetailProps> = ({ planId, week, today, onBack }) => {
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [form, setForm] = useState<NewWorkoutForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  async function move(index: number, direction: -1 | 1): Promise<void> {
    const other = week.sessions[index + direction]
    const current = week.sessions[index]
    if (!other || !current) return
    setError(null)
    try {
      await swapWorkoutOrder(current.instanceId, other.instanceId)
      await syncQueue(today)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder these workouts.')
    }
  }

  async function handleAddWorkout(): Promise<void> {
    const estMinutes = Number.parseInt(form.estMinutes, 10)
    if (!form.name.trim() || !Number.isFinite(estMinutes) || estMinutes <= 0) {
      setError('Enter a name and a positive estimated duration.')
      return
    }
    setError(null)
    try {
      await addWorkoutToWeek({
        planId, weekNumber: week.weekNumber, name: form.name.trim(), kind: form.kind, priority: form.priority, estMinutes,
      })
      await syncQueue(today)
      setIsAdding(false)
      setForm(EMPTY_FORM)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this workout.')
    }
  }

  return (
    <div className="week-detail">
      <button type="button" className="week-detail__back" onClick={onBack}>&larr; All weeks</button>
      <h2 className="week-detail__heading">Week {week.weekNumber} &middot; {week.phaseName}</h2>
      {week.label && <p className="week-detail__label">{week.label}</p>}

      {week.sessions.length === 0 && (
        <EmptyState title="No sessions this week" description="Add a workout to get started." />
      )}

      {week.sessions.length > 0 && (
        <ul className="week-detail__list">
          {week.sessions.map((session, index) => {
            const prevFrozen = week.sessions[index - 1]?.frozen ?? true
            const nextFrozen = week.sessions[index + 1]?.frozen ?? true
            return (
              <li key={session.instanceId} className="week-detail__row">
                <div className="week-detail__row-info">
                  <span className="week-detail__row-name">{session.name}</span>
                  <span className="week-detail__row-chips">
                    <Chip tone="neutral">{KIND_LABEL[session.kind]}</Chip>
                    <Chip tone={STATUS_TONE[session.status]}>{STATUS_LABEL[session.status]}</Chip>
                  </span>
                </div>
                <div className="week-detail__row-actions">
                  <button
                    type="button" className="week-detail__reorder-btn" aria-label={`Move ${session.name} up`}
                    disabled={session.frozen || index === 0 || prevFrozen}
                    onClick={() => { move(index, -1).catch(() => {}) }}
                  >
                    &uarr;
                  </button>
                  <button
                    type="button" className="week-detail__reorder-btn" aria-label={`Move ${session.name} down`}
                    disabled={session.frozen || index === week.sessions.length - 1 || nextFrozen}
                    onClick={() => { move(index, 1).catch(() => {}) }}
                  >
                    &darr;
                  </button>
                  <Button size="sm" variant="secondary" onClick={() => { setEditingInstanceId(session.instanceId) }}>
                    Edit
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {error && <p role="alert" className="week-detail__error">{error}</p>}

      <Button variant="secondary" onClick={() => { setIsAdding(true) }}>Add workout</Button>

      <Sheet open={isAdding} onClose={() => { setIsAdding(false) }} title="Add workout">
        <div className="week-detail__add-form">
          <label htmlFor="new-workout-name">Name</label>
          <input id="new-workout-name" type="text" value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })) }} />
          <label htmlFor="new-workout-kind">Kind</label>
          <select id="new-workout-kind" value={form.kind} onChange={(e) => { setForm((f) => ({ ...f, kind: e.target.value as WorkoutKind })) }}>
            {WORKOUT_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label htmlFor="new-workout-priority">Priority</label>
          <select id="new-workout-priority" value={form.priority} onChange={(e) => { setForm((f) => ({ ...f, priority: e.target.value as Priority })) }}>
            {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label htmlFor="new-workout-minutes">Estimated minutes</label>
          <input
            id="new-workout-minutes" type="text" inputMode="numeric" value={form.estMinutes}
            onChange={(e) => { setForm((f) => ({ ...f, estMinutes: e.target.value })) }}
          />
          <Button onClick={() => { handleAddWorkout().catch(() => {}) }}>Add</Button>
        </div>
      </Sheet>

      <WorkoutEditor
        instanceId={editingInstanceId}
        today={today}
        onClose={() => { setEditingInstanceId(null) }}
      />
    </div>
  )
}

