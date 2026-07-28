import { ErrorBoundary } from '@/components'
import { BootGate } from '@/features/shell/BootGate'
import { AppRoutes } from '@/router'

/**
 * Deliberately Router-agnostic: `main.tsx` wraps this in `BrowserRouter`,
 * while `renderApp` (tests) wraps it in `MemoryRouter` instead.
 *
 * The root `ErrorBoundary` is deliberate belt-and-braces on top of the
 * per-route and per-layout boundaries inside `router.tsx`: it means there
 * is no path from any component error — including one in a boundary this
 * one wraps, or in `BootGate` itself once it's past the boot sequence — to
 * a genuinely blank page.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <BootGate>
        <AppRoutes />
      </BootGate>
    </ErrorBoundary>
  )
}
