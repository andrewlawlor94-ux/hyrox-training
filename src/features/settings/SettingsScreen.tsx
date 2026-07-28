import type { FC } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { ProfileSettings } from './ProfileSettings'
import { GoalSettings } from './GoalSettings'
import { UnitSettings } from './UnitSettings'
import { TimerSettings } from './TimerSettings'

/**
 * Settings-lite (Task 29, reduced scope): athlete profile, race goal and
 * date, units, and rest-timer defaults. The backup/restore UI and the HYROX
 * standards editor are a later phase — see the Task 24/29L report — so this
 * screen stays the smallest HONEST set of controls that are real and working
 * today, not a placeholder for what's still to come.
 */
export const SettingsScreen: FC = () => {
  const settings = useSettings()

  if (settings === undefined) return <p className="settings-screen__loading">Loading…</p>

  return (
    <div className="settings-screen">
      <h1 className="settings-screen__heading">Settings</h1>
      <ProfileSettings />
      <GoalSettings />
      <UnitSettings settings={settings} />
      <TimerSettings settings={settings} />
    </div>
  )
}
