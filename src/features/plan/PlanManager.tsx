import type { FC } from 'react'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Chip } from '@/components'
import {
  archivePlan, changePlanDuration, duplicatePlan, getActiveGoal, installSeedPlan, listPlans,
  resetRecommendations, restoreSeedPlanPreservingHistory, setActivePlan, syncQueue,
} from '@/data/repositories'
import { activePlanCoreWeeks } from './planData'

interface PlanManagerProps {
  today: string
  onClose: () => void
}

/**
 * Plan-level operations (§14): duplicate, archive, select a new active plan
 * ("restore" an archived one = make it active again), create a plan from
 * scratch, restore the shipped plan while keeping history, change the core
 * duration, and reset automated schedule recommendations. Race date and
 * target time are NOT duplicated here — they already live in Settings
 * (`GoalSettings`, reusing `setRaceGoal`); see the Task 27 report.
 */
export const PlanManager: FC<PlanManagerProps> = ({ today, onClose }) => {
  const plans = useLiveQuery(() => listPlans())
  const goal = useLiveQuery(() => getActiveGoal())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The plan's ACTUAL core-week count, not a hard-coded 24. Showing 24 for a
  // plan that had been compressed to 8 (because race day is 8 weeks out) told
  // the athlete something plainly false, and typing over it would have silently
  // re-expanded the plan past race day.
  const coreWeeks = useLiveQuery(() => activePlanCoreWeeks())
  const [durationEdit, setDurationEdit] = useState<string | null>(null)
  const newDuration = durationEdit ?? (coreWeeks === undefined ? '' : String(coreWeeks))

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateFromScratch(): Promise<void> {
    if (!goal) return
    await run(() => installSeedPlan({ today, raceDate: goal.raceDate, now: new Date().toISOString() }))
  }

  async function handleChangeDuration(): Promise<void> {
    const coreWeeksCount = Number.parseInt(newDuration, 10)
    if (!Number.isFinite(coreWeeksCount) || coreWeeksCount <= 0) {
      setError('Enter a positive number of weeks.')
      return
    }
    await run(() => changePlanDuration({ coreWeeksCount, today }))
  }

  return (
    <div className="plan-manager">
      {error && <p role="alert" className="plan-manager__error">{error}</p>}

      <section className="plan-manager__section">
        <h3>Plans</h3>
        <ul className="plan-manager__list">
          {(plans ?? []).map((plan) => (
            <li key={plan.id} className="plan-manager__row">
              <span className="plan-manager__row-name">{plan.name}</span>
              <Chip tone={plan.status === 'active' ? 'green' : 'neutral'}>{plan.status === 'active' ? 'Active' : 'Archived'}</Chip>
              <div className="plan-manager__row-actions">
                {plan.status === 'active' && (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => { run(() => archivePlan(plan.id)).catch(() => {}) }}>
                    Archive
                  </Button>
                )}
                {plan.status === 'archived' && (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => { run(() => setActivePlan(plan.id)).catch(() => {}) }}>
                    Make active
                  </Button>
                )}
                <Button
                  size="sm" variant="secondary" disabled={busy}
                  onClick={() => { run(() => duplicatePlan(plan.id, `${plan.name} (copy)`, new Date().toISOString())).catch(() => {}) }}
                >
                  Duplicate
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="plan-manager__section">
        <h3>Duration</h3>
        <label htmlFor="plan-manager-duration">Core weeks</label>
        <input
          id="plan-manager-duration" type="text" inputMode="numeric" value={newDuration}
          onChange={(e) => { setDurationEdit(e.target.value) }}
        />
        <Button variant="secondary" disabled={busy} onClick={() => { handleChangeDuration().catch(() => {}) }}>Change duration</Button>
        <p className="plan-manager__hint">
          This follows race day automatically — changing the race date in Settings re-fits the plan.
          Set it by hand only to override that.
        </p>
      </section>

      <section className="plan-manager__section">
        <h3>Other actions</h3>
        <Button variant="secondary" disabled={busy || !goal} onClick={() => { handleCreateFromScratch().catch(() => {}) }}>
          Create new plan from scratch
        </Button>
        <Button
          variant="secondary" disabled={busy}
          onClick={() => { run(() => restoreSeedPlanPreservingHistory({ today, now: new Date().toISOString() })).catch(() => {}) }}
        >
          Restore shipped plan (keep history)
        </Button>
        <Button
          variant="secondary" disabled={busy}
          onClick={() => { run(async () => { await resetRecommendations(new Date().toISOString()); await syncQueue(today) }).catch(() => {}) }}
        >
          Reset schedule recommendations
        </Button>
      </section>

      <Button onClick={onClose}>Close</Button>
    </div>
  )
}
