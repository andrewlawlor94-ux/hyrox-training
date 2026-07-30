import type { FC } from 'react'
import { Card } from '@/components'
import { formatLoad } from '@/domain/units/format'
import type { PersonalBests } from '@/domain/strength/personalBests'

interface PersonalBestsCardProps {
  bests: PersonalBests
}

/**
 * Compact number over prose (§17): three rows, each a value plus its date, no
 * explanatory paragraph. The estimated-1RM row is explicitly labelled
 * "estimated" — same rule as `OneRepMaxChart` — since it's Epley's formula, not
 * a measured lift.
 *
 * The date sits UNDER the figure, muted, rather than inside parentheses after
 * it: the number is what the athlete came to read, and "175 lb x 5 (2026-01-05)"
 * makes them parse past a bracket to get it. `NOT_ENOUGH_DATA` deliberately
 * renders in the value slot with no date beneath — an absent best has no date,
 * and inventing a blank line for one would suggest it does.
 */
const NOT_ENOUGH_DATA = 'Not enough data yet'

const Best: FC<{ label: string; value: string | null; date: string | null }> = ({ label, value, date }) => (
  <>
    <dt>{label}</dt>
    <dd>
      <span className="personal-bests-card__value">{value ?? NOT_ENOUGH_DATA}</span>
      {value !== null && date !== null && <span className="personal-bests-card__date">{date}</span>}
    </dd>
  </>
)

export const PersonalBestsCard: FC<PersonalBestsCardProps> = ({ bests }) => (
  <Card as="section" className="personal-bests-card">
    <h3>Personal bests</h3>
    <dl>
      <Best
        label="Heaviest set"
        value={bests.heaviestSet
          ? `${formatLoad({ value: bests.heaviestSet.weight, unit: bests.heaviestSet.unit })} x ${String(bests.heaviestSet.reps)}`
          : null}
        date={bests.heaviestSet?.date ?? null}
      />
      <Best
        label="Best estimated 1RM"
        value={bests.bestEstimated1RM
          ? formatLoad({ value: bests.bestEstimated1RM.value, unit: bests.bestEstimated1RM.unit })
          : null}
        date={bests.bestEstimated1RM?.date ?? null}
      />
      <Best
        label="Best session volume"
        value={bests.bestVolumeSession
          ? formatLoad({ value: bests.bestVolumeSession.volume, unit: bests.bestVolumeSession.unit })
          : null}
        date={bests.bestVolumeSession?.date ?? null}
      />
    </dl>
  </Card>
)
