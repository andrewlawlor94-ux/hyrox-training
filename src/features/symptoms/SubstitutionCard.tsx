import type { FC } from 'react'
import { useState } from 'react'
import { Button, Card, NumberField } from '@/components'
import { applySubstitution, getSettings, updateSettings } from '@/data/repositories'
import type { WorkoutInstance } from '@/data/types'
import type { SymptomAdvice } from '@/domain/symptoms/substitutions'
import { dismissalKey } from './affectedInstances'

const DEFAULT_MODIFY_PERCENT = 25
const PERCENT_TO_FACTOR = 100

interface SubstitutionCardProps {
  advice: SymptomAdvice
  /** The still-scheduled sessions in the next week this advice would change —
   * `sessionsForStream`. Empty when there are none, which is what turns the
   * apply control off rather than leaving it there doing nothing. */
  sessions: WorkoutInstance[]
}

function sessionCountLabel(count: number): string {
  return count === 1 ? '1 session this week' : `${String(count)} sessions this week`
}

/**
 * One symptom stream's training-load advice (§16), as a single card.
 *
 * Three things the athlete reported about the previous version, all fixed here:
 *
 * - **Volume.** This was rendered once per suggestion per affected session,
 *   across the whole remaining plan — hundreds of cards from one sore shin.
 *   `buildSymptomAdvice` now returns at most one entry per stream and the
 *   suggestions are its bullet points.
 * - **Dead buttons.** Every card offered "Accept", but four of the six kinds
 *   change nothing in the plan — `applySubstitution` has no branch for them and
 *   returned success regardless. Only the genuinely actionable ones now get an
 *   apply control, and it is absent (not merely inert) when there is nothing in
 *   the next week to apply it to.
 * - **No stated cause.** The card now leads with the report that raised it.
 *
 * Accepting applies every actionable item to every affected session, then
 * dismisses the card — so the tap visibly does something, which is the other
 * half of "the button doesn't work".
 */
export const SubstitutionCard: FC<SubstitutionCardProps> = ({ advice, sessions }) => {
  const [modifyOpen, setModifyOpen] = useState(false)
  const [percent, setPercent] = useState<number | null>(DEFAULT_MODIFY_PERCENT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const actionable = advice.items.filter((item) => item.actionable)
  const canApply = actionable.length > 0 && sessions.length > 0

  async function dismiss(): Promise<void> {
    const settings = await getSettings()
    const key = dismissalKey(advice)
    if (settings.dismissedSubstitutions.includes(key)) return
    await updateSettings({ dismissedSubstitutions: [...settings.dismissedSubstitutions, key] })
  }

  async function apply(factor?: number): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      for (const [index, session] of sessions.entries()) {
        for (const item of actionable) {
          // "Replace ONE hard run this week" means one. Applying the swap to
          // every affected session turned a week of running into a week of
          // SkiErg, which is neither what the card says nor what easing impact
          // for a week is supposed to mean. Volume reduction, by contrast,
          // genuinely applies across the week.
          if (item.kind === 'swapHardRunForLowImpact' && index > 0) continue
          await applySubstitution({ instanceId: session.id, kind: item.kind, ...(factor !== undefined ? { factor } : {}) })
        }
      }
      // Dismissed on success so the card leaves the screen. Without this the
      // tap changed the plan silently and the card sat there unchanged, which
      // is indistinguishable from a button that does nothing.
      await dismiss()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply this change.')
    } finally {
      setBusy(false)
      setModifyOpen(false)
    }
  }

  return (
    <Card className="substitution-card">
      <p className="substitution-card__title">{advice.headline}</p>
      {/* Why this appeared, in the athlete's own reported terms. */}
      <p className="substitution-card__reason">{advice.reason}</p>

      <ul className="substitution-card__items">
        {advice.items.map((item) => (
          <li key={item.kind} className="substitution-card__item">
            <span className="substitution-card__item-title">{item.title}</span>
            <span className="substitution-card__detail">{item.detail}</span>
          </li>
        ))}
      </ul>

      {canApply && (
        <p className="substitution-card__scope">{`Applying changes ${sessionCountLabel(sessions.length)}.`}</p>
      )}
      {actionable.length > 0 && sessions.length === 0 && (
        // Said rather than shown as a button that would do nothing.
        <p className="substitution-card__scope">No affected sessions in the next week, so there is nothing to change.</p>
      )}

      {modifyOpen && canApply && (
        <div className="substitution-card__modify">
          <NumberField id={`substitution-modify-${advice.stream}`} label="Reduction" unit="%" value={percent} onChange={setPercent} />
          <Button
            size="sm" disabled={busy || percent === null}
            onClick={() => { void apply(percent === null ? undefined : 1 - percent / PERCENT_TO_FACTOR) }}
          >
            Apply
          </Button>
        </div>
      )}

      <div className="substitution-card__actions">
        {canApply && (
          <>
            <Button size="sm" disabled={busy} onClick={() => { void apply() }}>Apply to my plan</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setModifyOpen((open) => !open) }}>Modify</Button>
          </>
        )}
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => { void dismiss() }}>
          {canApply ? 'Dismiss' : 'Got it'}
        </Button>
      </div>

      {error && <p role="alert" className="substitution-card__error">{error}</p>}
      <p className="substitution-card__disclaimer">{advice.disclaimer}</p>
    </Card>
  )
}
