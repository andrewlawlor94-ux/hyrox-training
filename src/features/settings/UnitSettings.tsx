import type { FC } from 'react'
import { SegmentedControl } from '@/components'
import { updateSettings } from '@/data/repositories'
import type { AppSettings, Unit } from '@/data/types'

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
]

interface UnitSettingsProps {
  settings: AppSettings
}

/** Strength and station load units. */
export const UnitSettings: FC<UnitSettingsProps> = ({ settings }) => (
  <section className="settings-screen__section">
    <h2>Units</h2>
    <SegmentedControl
      label="Strength unit"
      value={settings.strengthUnit}
      onChange={(value) => { void updateSettings({ strengthUnit: value }) }}
      options={UNIT_OPTIONS}
    />
    <SegmentedControl
      label="Station unit"
      value={settings.stationUnit}
      onChange={(value) => { void updateSettings({ stationUnit: value }) }}
      options={UNIT_OPTIONS}
    />
  </section>
)
