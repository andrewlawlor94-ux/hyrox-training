import type { FC } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useSettings } from '@/hooks/useSettings'
import { RestTimerBar } from '@/features/timer/RestTimerBar'
import { useRestTimer } from '@/features/timer/useRestTimer'
import { BottomNav } from './BottomNav'

/**
 * Layout route for every "main app" screen (Home, Settings): redirects to
 * `/onboarding` until `onboardingCompletedAt` is set, otherwise renders the
 * matched child in a scrolling `<main>` above the fixed bottom nav. Waits
 * for `useSettings` to resolve past `undefined` before deciding the
 * redirect, so a fresh-but-already-onboarded athlete is never bounced to
 * onboarding just because the first read hasn't landed yet.
 *
 * `RestTimerBar` (Task 20) sits between `<main>` and `<BottomNav>`, fixed
 * above the nav regardless of where it renders in the tree; `main` gets an
 * extra bottom-padding class while a timer row exists so scrolled content
 * never sits underneath the bar. The active-workout bar's slot lands with
 * a later task — none rendered yet.
 */
export const AppShell: FC = () => {
  const settings = useSettings()
  const { state } = useRestTimer()

  if (settings === undefined) return <p className="app-shell__loading">Loading…</p>
  if (!settings.onboardingCompletedAt) return <Navigate to="/onboarding" replace />

  const mainClassName = state === undefined ? 'app-shell__main' : 'app-shell__main app-shell__main--timer-active'

  return (
    <div className="app-shell">
      <main className={mainClassName}>
        <Outlet />
      </main>
      <RestTimerBar />
      <BottomNav />
    </div>
  )
}
