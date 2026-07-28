import { BootGate } from '@/features/shell/BootGate'
import { AppRoutes } from '@/router'

/** Deliberately Router-agnostic: `main.tsx` wraps this in `BrowserRouter`,
 * while `renderApp` (tests) wraps it in `MemoryRouter` instead. */
export default function App() {
  return (
    <BootGate>
      <AppRoutes />
    </BootGate>
  )
}
