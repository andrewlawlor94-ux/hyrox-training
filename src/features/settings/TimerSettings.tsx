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
      {/* Said plainly rather than left to be discovered mid-session. The beep is
          queued in the audio graph when a rest starts (see `scheduleTone`), which
          is what makes it survive a locked screen — but nothing a web app can do
          survives iOS suspending the page when you switch apps. Claiming
          otherwise would be the more useful-sounding answer and the wrong one. */}
      <p className="settings-screen__note">
        The rest beep is queued as soon as a rest starts, so it still sounds with the screen off or
        the phone in your pocket. Switching to another app on an iPhone suspends the page and stops
        it — when you come back the bar tells you how long ago the rest ended. Only a native app can
        alarm through that, which this is not.
      </p>
    </section>
  )
}
