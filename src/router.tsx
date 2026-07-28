import type { FC } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from '@/components'
import { AppShell } from '@/features/shell/AppShell'
import { HomeScreen } from '@/features/home/HomeScreen'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen'
import { WorkoutScreen } from '@/features/workout/WorkoutScreen'

/**
 * Home, Settings, and Workout logging (all three laid out inside
 * `AppShell`, so the rest-timer bar and bottom nav stay visible) plus
 * Onboarding (full-screen, reached before any tab is meaningful). The
 * brief's fuller route table — Progress, Plan, the Week/Workout editors, the
 * exercise library — belongs to later tasks; wiring those paths now, with no
 * screen behind them, would be the exact placeholder/dead-route pattern the
 * Global Constraints forbid. Each is added the task its screen lands,
 * mirroring how `BottomNav`'s `NAV_ITEMS` array grows. Any unmatched path
 * falls back to Home rather than a blank 404.
 */
export const AppRoutes: FC = () => (
  <Routes>
    <Route
      path="/onboarding"
      element={(
        <ErrorBoundary>
          <OnboardingScreen />
        </ErrorBoundary>
      )}
    />
    {/* AppShell itself (the layout element, not just its route children) is
      * wrapped: it renders `useSettings()`, and any error there — or
      * anywhere else inside the shell that isn't already caught by a more
      * specific boundary below — would otherwise take the whole app down
      * to a blank page with no boundary above it to catch it. */}
    <Route
      element={(
        <ErrorBoundary>
          <AppShell />
        </ErrorBoundary>
      )}
    >
      <Route
        path="/"
        element={(
          <ErrorBoundary>
            <HomeScreen />
          </ErrorBoundary>
        )}
      />
      <Route
        path="/settings"
        element={(
          <ErrorBoundary>
            <SettingsScreen />
          </ErrorBoundary>
        )}
      />
      <Route
        path="/workout/:id"
        element={(
          <ErrorBoundary>
            <WorkoutScreen />
          </ErrorBoundary>
        )}
      />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
)
