import type { FC } from 'react'
import { SegmentedControl } from '@/components'
import { updateSettings } from '@/data/repositories'
import type { AppSettings } from '@/data/types'
import { vibrationSupported } from '@/features/timer/feedback'

type OnOff = 'on' | 'off'

const ON_OFF_OPTIONS: { value: OnOff; label: string }[] = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

interface TimerSettingsProps {
  settings: AppSettings
}

/**
 * Rest-timer defaults: sound and vibration, both off until the athlete opts
 * in (see `settingsRepo`'s `defaultSettings`). The vibration control is
 * disabled with an explanatory note whenever `navigator.vibrate` doesn't
 * exist (iOS Safari) — offering a toggle with no device behind it would be
 * exactly the dead-control pattern the Global Constraints forbid.
 */
export const TimerSettings: FC<TimerSettingsProps> = ({ settings }) => {
  const canVibrate = vibrationSupported()

  return (
    <section className="settings-screen__section">
      <h2>Rest timer</h2>
      <SegmentedControl
        label="Rest sound"
        value={settings.restSoundEnabled ? 'on' : 'off'}
        onChange={(value) => { void updateSettings({ restSoundEnabled: value === 'on' }) }}
        options={ON_OFF_OPTIONS}
      />
      <fieldset className="settings-screen__vibration" disabled={!canVibrate}>
        <SegmentedControl
          label="Rest vibration"
          value={settings.restVibrationEnabled ? 'on' : 'off'}
          onChange={(value) => { void updateSettings({ restVibrationEnabled: value === 'on' }) }}
          options={ON_OFF_OPTIONS}
        />
      </fieldset>
      {!canVibrate && (
        <p className="settings-screen__note">
          This device doesn&apos;t support vibration, so this setting has no effect here.
        </p>
      )}
    </section>
  )
}
