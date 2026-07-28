import type { FC } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useSettings } from '@/hooks/useSettings'
import { BottomNav } from './BottomNav'

/**
 * Layout route for every "main app" screen (Home, Settings): redirects to
 * `/onboarding` until `onboardingCompletedAt` is set, otherwise renders the
 * matched child in a scrolling `<main>` above the fixed bottom nav. Waits
 * for `useSettings` to resolve past `undefined` before deciding the
 * redirect, so a fresh-but-already-onboarded athlete is never bounced to
 * onboarding just because the first read hasn't landed yet.
 *
 * Slots for the rest-timer bar (Task 20) and the active-workout bar sit
 * between `<main>` and `<BottomNav>` once those tasks land — none exist yet,
 * so none are rendered now.
 */
export const AppShell: FC = () => {
  const settings = useSettings()

  if (settings === undefined) return <p className="app-shell__loading">Loading…</p>
  if (!settings.onboardingCompletedAt) return <Navigate to="/onboarding" replace />

  return (
    <div className="app-shell">
      <main className="app-shell__main">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
