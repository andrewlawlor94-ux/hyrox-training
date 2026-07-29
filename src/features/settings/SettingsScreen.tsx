import type { FC } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { ProfileSettings } from './ProfileSettings'
import { GoalSettings } from './GoalSettings'
import { UnitSettings } from './UnitSettings'
import { TimerSettings } from './TimerSettings'
import { BackupSettings } from './BackupSettings'

/**
 * Settings-lite (Task 29, reduced scope): athlete profile, race goal and
 * date, units, and rest-timer defaults — plus backup/restore (Task 17),
 * added once the athlete started logging real sessions and local-only
 * IndexedDB became the single copy of their training history. The HYROX
 * standards editor is still a later phase — see the Task 24/29L report.
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
      <BackupSettings settings={settings} />
    </div>
  )
}
