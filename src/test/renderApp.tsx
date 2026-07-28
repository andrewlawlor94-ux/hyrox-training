// Side-effect import: the app's real stylesheet, so accessibility assertions
// (tap-target min-height, input font-size) exercise the actual cascade
// rather than a stub. main.tsx is the only other place this import happens;
// renderApp is main.tsx's equivalent for tests, so it must carry it too.
import '@/styles/global.css'
import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'

/**
 * Renders `<App />` the same way `main.tsx` does — wrapped in a router —
 * except `MemoryRouter` stands in for `BrowserRouter` so tests can start at
 * any route without touching real browser history. Every screen test uses
 * this rather than rendering its own component tree directly, so a change
 * to how the app is wired (providers, boot sequence) only has to be taught
 * to one helper.
 */
export function renderApp(opts?: { route?: string }): RenderResult {
  const route = opts?.route ?? '/'
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}
