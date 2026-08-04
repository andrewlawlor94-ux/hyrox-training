import type { FC } from 'react'
import { Card } from '@/components'
import type { WarmupSubject } from '@/domain/warmup/drills'
import { warmupDrillsFor } from '@/domain/warmup/drills'

interface WarmupCardProps {
  /** Every prescribed exercise, in session order. Order matters: the drills for
   * the first exercise come first. Passed whole rather than as categories so a
   * SkiErg and a rower can be told apart — see `DRILLS_BY_EXERCISE_ID`. */
  exercises: readonly WarmupSubject[]
}

/**
 * Suggested warm-up for THIS session, derived from the movements it actually
 * contains (athlete: "Should look at workout and give warm up ideas based on
 * moves. For example, lifting deadlift or squats should have some core warm up
 * like dead bugs and other things").
 *
 * Collapsed by default. It is guidance to glance at before starting, not another
 * block to log, and leaving it open would push the first real exercise below the
 * fold on a phone. Nothing here is recorded — no sets, no completion state — so
 * skipping it costs nothing and it never pollutes training history.
 *
 * Renders nothing at all when the session's movements suggest nothing, rather
 * than an empty card.
 */
export const WarmupCard: FC<WarmupCardProps> = ({ exercises }) => {
  const drills = warmupDrillsFor(exercises)
  if (drills.length === 0) return null

  return (
    <Card as="section" className="warmup-card">
      <details>
        <summary className="warmup-card__summary">
          Suggested warm-up
          <span className="warmup-card__count">{drills.length} drills</span>
        </summary>
        <ul className="warmup-card__list">
          {drills.map((drill) => (
            <li key={drill.id} className="warmup-drill">
              <span className="warmup-drill__name">{drill.name}</span>
              <span className="warmup-drill__dose">{drill.dose}</span>
              {/* The reason is the difference between a list that gets done and
                  one that gets skipped. */}
              <span className="warmup-drill__why">{drill.why}</span>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  )
}
