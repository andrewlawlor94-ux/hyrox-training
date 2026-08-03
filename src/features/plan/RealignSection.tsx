import type { FC } from 'react'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Sheet } from '@/components'
import { previewRealign, realignScheduleToToday } from '@/data/repositories'
import type { ISODate } from '@/data/types'

interface RealignSectionProps {
  today: ISODate
}

/** A count phrased as a sentence fragment, so "1 session" never reads "1 sessions". */
function plural(count: number, singular: string): string {
  return `${String(count)} ${singular}${count === 1 ? '' : 's'}`
}

/**
 * "Realign to today" — the athlete's own ask: "Need way to reset schedule
 * properly. Look at history and start today. Sometimes schedule gets too out of
 * wack and needs to be aligned."
 *
 * The two numbers at the top ARE the problem, side by side: the week the plan
 * currently thinks it is in (pure calendar) against the week the athlete's
 * completed sessions say they reached. Whenever those disagree the plan has
 * drifted, and this is the one button that puts them back together.
 *
 * Previewed before it runs, always. A realign moves every upcoming session, and
 * when the plan's length changes it regenerates future content — so what it will
 * do is on screen before anything is committed, and the confirmation names the
 * one genuinely lossy consequence rather than hiding it behind "are you sure?".
 */
export const RealignSection: FC<RealignSectionProps> = ({ today }) => {
  const preview = useLiveQuery(() => previewRealign(today), [today])
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function handleRealign(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const decision = await realignScheduleToToday({ today, now: new Date().toISOString() })
      setResult(decision?.explanation ?? 'There is no active plan to realign.')
      setConfirming(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The schedule could not be realigned.')
    } finally {
      setBusy(false)
    }
  }

  if (preview === undefined) {
    return (
      <section className="plan-manager__section">
        <h3>Alignment</h3>
        <p className="plan-manager__hint">Checking where the plan is…</p>
      </section>
    )
  }

  const { decision } = preview
  const raceGone = decision.outcome === 'raceInPast'
  // The calendar week can be zero or negative for a plan that has not started.
  const planWeekLabel = preview.currentWeekNumber >= 1 ? `Week ${String(preview.currentWeekNumber)}` : 'Not started'
  const historyWeekLabel = `Week ${String(decision.requestedResumeWeek)}`
  const drifted = preview.currentWeekNumber !== decision.requestedResumeWeek

  return (
    <section className="plan-manager__section">
      <h3>Alignment</h3>

      <div className="realign__compare">
        <div className="realign__figure">
          <span className="realign__figure-label">Plan is on</span>
          <strong className="realign__figure-value">{planWeekLabel}</strong>
        </div>
        <div className="realign__figure">
          <span className="realign__figure-label">Your history is on</span>
          <strong className="realign__figure-value">{historyWeekLabel}</strong>
        </div>
      </div>

      <p className="plan-manager__hint">
        {drifted
          ? 'These disagree, so the plan has drifted from your training. Realigning restarts it at the week you actually reached, from today.'
          : 'These agree, so the plan is tracking your training. Realigning would still clear any pinned moves.'}
      </p>

      <p className="realign__explanation">{decision.explanation}</p>

      {!raceGone && (
        <ul className="realign__consequences">
          <li>
            {preview.weeksLeftBehind === 0
              ? 'No plan week ends up behind you.'
              : `${plural(preview.weeksLeftBehind, 'week')} of the plan end up behind you.`}
          </li>
          {preview.weeksLeftBehind > 0 && (
            <li>
              {preview.sessionsLeftBehind === 0
                ? 'Every session in those weeks was done.'
                : `${plural(preview.sessionsLeftBehind, 'session')} never done in those weeks count as missed.`}
            </li>
          )}
          <li>
            {preview.pinnedMovesCleared === 0
              ? 'There are no pinned moves to clear.'
              : `${plural(preview.pinnedMovesCleared, 'pinned move')} cleared.`}
          </li>
          <li>Every completed session, and everything you logged in it, is kept.</li>
        </ul>
      )}

      <Button
        variant={decision.requiresRegeneration ? 'danger' : 'secondary'}
        disabled={busy || raceGone}
        onClick={() => { setConfirming(true) }}
      >
        Realign to today
      </Button>

      {error && <p role="alert" className="plan-manager__error">{error}</p>}
      {result && <p role="status" className="realign__result">{result}</p>}

      <Sheet open={confirming} onClose={() => { setConfirming(false) }} title="Realign the schedule?">
        <div className="realign-confirm">
          <p>{decision.explanation}</p>
          {decision.requiresRegeneration && (
            <p className="realign-confirm__warning" role="alert">
              The plan changes length, so weeks you have not started yet are rebuilt from the
              programme. Any edits you made to those future sessions are lost. Completed sessions,
              and anything in progress that you have already logged, are untouched.
            </p>
          )}
          <div className="realign-confirm__actions">
            <Button variant="secondary" disabled={busy} onClick={() => { setConfirming(false) }}>Cancel</Button>
            <Button
              variant={decision.requiresRegeneration ? 'danger' : 'primary'}
              disabled={busy}
              onClick={() => { handleRealign().catch(() => {}) }}
            >
              {busy ? 'Realigning…' : 'Realign'}
            </Button>
          </div>
        </div>
      </Sheet>
    </section>
  )
}
