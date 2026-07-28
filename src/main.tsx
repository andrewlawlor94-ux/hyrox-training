import './styles/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { UpdatePrompt } from './features/shell/UpdatePrompt'
import { initPwaUpdateWatcher } from './pwa'

// Registers the service worker once per tab. `registerType: 'prompt'`
// (vite.config.ts) means this never swaps the app out from under an athlete
// on its own — see src/pwa.ts and UpdatePrompt for the non-destructive
// update flow this only kicks off.
initPwaUpdateWatcher()

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')
createRoot(root).render(
  <StrictMode>
    {/* `BASE_URL` matches vite.config.ts's `base` (a repo subpath on GitHub
      * Pages, '/' locally) so client-side routes resolve under whichever
      * one the app is actually deployed at. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
    <UpdatePrompt />
  </StrictMode>,
)
