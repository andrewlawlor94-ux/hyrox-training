import type { FC } from 'react'
import { SegmentedControl } from '@/components'
import { updateSettings } from '@/data/repositories'
import { useSettings } from '@/hooks/useSettings'
import type { Unit } from '@/data/types'

type OnOff = 'on' | 'off'

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
]

const ON_OFF_OPTIONS: { value: OnOff; label: string }[] = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

/**
 * Deliberately LITE for Task 18/19: profile editing, race-goal editing,
 * backup/restore, and the HYROX-standards editor are Task 29L's job (see
 * the roadmap). This is the smallest HONEST screen that can sit behind the
 * "Settings" nav tab today — real, working preferences wired straight to
 * `updateSettings`, not a "coming soon" placeholder.
 */
export const SettingsScreen: FC = () => {
  const settings = useSettings()

  if (settings === undefined) return <p className="settings-screen__loading">Loading…</p>

  return (
    <div className="settings-screen">
      <h1 className="settings-screen__heading">Settings</h1>
      <section className="settings-screen__section">
        <SegmentedControl
          label="Strength unit"
          value={settings.strengthUnit}
          onChange={(value) => { void updateSettings({ strengthUnit: value }) }}
          options={UNIT_OPTIONS}
        />
      </section>
      <section className="settings-screen__section">
        <SegmentedControl
          label="Station unit"
          value={settings.stationUnit}
          onChange={(value) => { void updateSettings({ stationUnit: value }) }}
          options={UNIT_OPTIONS}
        />
      </section>
      <section className="settings-screen__section">
        <SegmentedControl
          label="Rest sound"
          value={settings.restSoundEnabled ? 'on' : 'off'}
          onChange={(value) => { void updateSettings({ restSoundEnabled: value === 'on' }) }}
          options={ON_OFF_OPTIONS}
        />
      </section>
      <section className="settings-screen__section">
        <SegmentedControl
          label="Rest vibration"
          value={settings.restVibrationEnabled ? 'on' : 'off'}
          onChange={(value) => { void updateSettings({ restVibrationEnabled: value === 'on' }) }}
          options={ON_OFF_OPTIONS}
        />
      </section>
    </div>
  )
}
