import type { FC } from 'react'
import { Card } from '@/components'
import { formatLoad } from '@/domain/units/format'
import type { PersonalBests } from '@/domain/strength/personalBests'

interface PersonalBestsCardProps {
  bests: PersonalBests
}

/** Compact number over prose (§17): three rows, each a value plus its date,
 * no explanatory paragraph. The estimated-1RM row is explicitly labelled
 * "estimated" — same rule as `OneRepMaxChart` — since it's Epley's formula,
 * not a measured lift. */
export const PersonalBestsCard: FC<PersonalBestsCardProps> = ({ bests }) => (
  <Card as="section" className="personal-bests-card">
    <h3>Personal bests</h3>
    <dl>
      <dt>Heaviest set</dt>
      <dd>
        {bests.heaviestSet
          ? `${formatLoad({ value: bests.heaviestSet.weight, unit: bests.heaviestSet.unit })} x ${String(bests.heaviestSet.reps)} (${bests.heaviestSet.date})`
          : 'Not enough data yet'}
      </dd>

      <dt>Best estimated 1RM</dt>
      <dd>
        {bests.bestEstimated1RM
          ? `${formatLoad({ value: bests.bestEstimated1RM.value, unit: bests.bestEstimated1RM.unit })} (${bests.bestEstimated1RM.date})`
          : 'Not enough data yet'}
      </dd>

      <dt>Best session volume</dt>
      <dd>
        {bests.bestVolumeSession
          ? `${formatLoad({ value: bests.bestVolumeSession.volume, unit: bests.bestVolumeSession.unit })} (${bests.bestVolumeSession.date})`
          : 'Not enough data yet'}
      </dd>
    </dl>
  </Card>
)
