import type { FC } from 'react'
import type { Surface } from '@/data/types'
import { NumberField, SegmentedControl } from '@/components'
import { SURFACE_OPTIONS } from './constants'

interface SledFieldsProps {
  idPrefix: string
  totalLoadKg: number | null
  sledWeightKg: number | null
  surface: Surface
  onChangeTotalLoad: (value: number | null) => void
  onChangeSledWeight: (value: number | null) => void
  onChangeSurface: (value: Surface) => void
  onBlur: () => void
  /** The seeded standard's own `notes` text — always renders the friction
   * caveat verbatim rather than a paraphrase, since a slower time on a
   * different venue's turf is not necessarily lost fitness. */
  frictionNote: string | undefined
}

/** Extra fields specific to the two sled stations (push/pull): the sled's
 * own weight, the total loaded weight actually pushed/pulled, and the
 * surface — all three vary enough by venue that a bare completion time alone
 * would be a misleading cross-venue comparison. */
export const SledFields: FC<SledFieldsProps> = ({
  idPrefix, totalLoadKg, sledWeightKg, surface, onChangeTotalLoad, onChangeSledWeight, onChangeSurface, onBlur, frictionNote,
}) => (
  <div className="sled-fields">
    <div className="sled-fields__row">
      <NumberField
        id={`${idPrefix}-total-load`}
        label="Total loaded weight"
        unit="kg"
        value={totalLoadKg}
        onChange={onChangeTotalLoad}
        onBlur={onBlur}
      />
      <NumberField
        id={`${idPrefix}-sled-weight`}
        label="Sled weight"
        unit="kg"
        value={sledWeightKg}
        onChange={onChangeSledWeight}
        onBlur={onBlur}
      />
    </div>
    <SegmentedControl label="Surface" value={surface} onChange={onChangeSurface} options={SURFACE_OPTIONS} />
    {frictionNote && <p className="sled-fields__note">{frictionNote}</p>}
  </div>
)
