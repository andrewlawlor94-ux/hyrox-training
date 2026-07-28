import type { FC } from 'react'
import { useState } from 'react'
import { Button, Card, NumberField } from '@/components'
import { applySubstitution, getSettings, updateSettings } from '@/data/repositories'
import type { Substitution } from '@/domain/symptoms/substitutions'

const DEFAULT_MODIFY_PERCENT = 25
const PERCENT_TO_FACTOR = 100

function logAndIgnore(err: unknown): void {
  console.error('Substitution action failed', err)
}

interface SubstitutionCardProps {
  instanceId: string
  substitution: Substitution
}

/**
 * Renders one training-load `Substitution` (§16, D-something) with Accept,
 * Modify, and Dismiss, each one tap. Accept (and Modify, for
 * `reduceImpactVolume`) call `applySubstitution`, which mutates only THIS
 * instance's own `InstancePrescription` rows — never the template. Dismiss
 * records `${instanceId}:${kind}` in `settings.dismissedSubstitutions`, so
 * the card stops reappearing for this instance without suppressing it for a
 * different affected one. The disclaimer text is rendered VERBATIM — it was
 * worded deliberately to key off what the app measures rather than a
 * diagnosis, so it is never paraphrased here.
 */
export const SubstitutionCard: FC<SubstitutionCardProps> = ({ instanceId, substitution }) => {
  const [modifyOpen, setModifyOpen] = useState(false)
  const [percent, setPercent] = useState<number | null>(DEFAULT_MODIFY_PERCENT)

  async function accept(factor?: number): Promise<void> {
    await applySubstitution({ instanceId, kind: substitution.kind, ...(factor !== undefined ? { factor } : {}) })
  }

  async function applyModified(): Promise<void> {
    if (percent === null) return
    await accept(1 - percent / PERCENT_TO_FACTOR)
    setModifyOpen(false)
  }

  async function dismiss(): Promise<void> {
    const settings = await getSettings()
    const key = `${instanceId}:${substitution.kind}`
    if (settings.dismissedSubstitutions.includes(key)) return
    await updateSettings({ dismissedSubstitutions: [...settings.dismissedSubstitutions, key] })
  }

  return (
    <Card className="substitution-card">
      <p className="substitution-card__title">{substitution.title}</p>
      <p className="substitution-card__detail">{substitution.detail}</p>
      <p className="substitution-card__disclaimer">{substitution.disclaimer}</p>

      {modifyOpen && substitution.kind === 'reduceImpactVolume' && (
        <div className="substitution-card__modify">
          <NumberField id={`substitution-modify-${instanceId}-${substitution.kind}`} label="Reduction" unit="%" value={percent} onChange={setPercent} />
          <Button size="sm" onClick={() => { applyModified().catch(logAndIgnore) }}>Apply</Button>
        </div>
      )}

      <div className="substitution-card__actions">
        <Button size="sm" onClick={() => { accept().catch(logAndIgnore) }}>Accept</Button>
        <Button size="sm" variant="secondary" onClick={() => { setModifyOpen((open) => !open) }}>Modify</Button>
        <Button size="sm" variant="quiet" onClick={() => { dismiss().catch(logAndIgnore) }}>Dismiss</Button>
      </div>
    </Card>
  )
}
