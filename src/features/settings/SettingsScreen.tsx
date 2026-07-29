import type { FC } from 'react'
import { Link } from 'react-router-dom'
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
 *
 * The exercise library (Task 28, §13) is linked from here rather than given
 * its own bottom-nav tab: the brief's four destinations are Home, Progress,
 * Plan, and Settings, and Plan doesn't exist yet — adding a tab for it now
 * would be the placeholder/dead-link pattern the Global Constraints forbid
 * (the same reasoning `navItems.ts` already documents for why Plan itself
 * isn't a tab). Settings is the one entry point that both exists today and
 * never dead-ends.
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
      <section className="settings-screen__section">
        <h2>Exercise library</h2>
        <p className="settings-screen__note">
          Create, edit, duplicate, archive, and search the exercises the plan draws on.
        </p>
        <Link to="/library" className="btn btn--secondary">Open exercise library</Link>
      </section>
      <BackupSettings settings={settings} />
    </div>
  )
}
