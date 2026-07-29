import type { FC } from 'react'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from '@/components'
import { AppShell } from '@/features/shell/AppShell'
import { HomeScreen } from '@/features/home/HomeScreen'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen'
import { WorkoutScreen } from '@/features/workout/WorkoutScreen'

/**
 * Progress is the app's only Recharts consumer, and Recharts is most of the
 * entry bundle's weight (§ code-split follow-up) — an athlete who never
 * opens Progress should never pay for it on first paint. `lazy` moves the
 * whole screen (and everything it imports, including Recharts) into its own
 * chunk, fetched only when `/progress` is actually visited; the route's own
 * `ErrorBoundary` below already catches render errors, so a failed chunk
 * fetch (e.g. offline with an uncached chunk) surfaces the same "Something
 * went wrong" fallback instead of a blank screen.
 */
const ProgressScreen = lazy(() =>
  import('@/features/progress/ProgressScreen').then((module) => ({ default: module.ProgressScreen })))

/** The exercise library (Task 28, §13) is reached from a Settings link, not
 * a bottom-nav tab (see `navItems.ts`) or a Plan tab that doesn't exist yet
 * -- so it's visited far less often than Home/Progress/Settings. Lazy for
 * the same reason Progress is: an athlete who never opens it shouldn't pay
 * for its chunk on first paint. */
const LibraryScreen = lazy(() =>
  import('@/features/library/LibraryScreen').then((module) => ({ default: module.LibraryScreen })))

/**
 * Home, Settings, Workout logging, and Progress (all four laid out inside
 * `AppShell`, so the rest-timer bar and bottom nav stay visible) plus
 * Onboarding (full-screen, reached before any tab is meaningful). The
 * brief's fuller route table — Plan, the Week/Workout editors, the exercise
 * library — still belongs to later tasks; wiring those paths now, with no
 * screen behind them, would be the exact placeholder/dead-route pattern the
 * Global Constraints forbid. Each is added the task its screen lands,
 * mirroring how `BottomNav`'s `NAV_ITEMS` array grows (Progress's own tab
 * lands in the Task 25/26 report's third commit). Any unmatched path falls
 * back to Home rather than a blank 404.
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
      <Route
        path="/progress"
        element={(
          <ErrorBoundary>
            <Suspense fallback={<p className="route-loading">Loading…</p>}>
              <ProgressScreen />
            </Suspense>
          </ErrorBoundary>
        )}
      />
      <Route
        path="/library"
        element={(
          <ErrorBoundary>
            <Suspense fallback={<p className="route-loading">Loading…</p>}>
              <LibraryScreen />
            </Suspense>
          </ErrorBoundary>
        )}
      />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
)
