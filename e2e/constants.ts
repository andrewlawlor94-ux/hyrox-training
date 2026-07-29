/**
 * The app is deployed to `https://<user>.github.io/hyrox-training/` (see
 * `.github/workflows/deploy.yml`'s `VITE_BASE: /${{ github.event.repository.name
 * }}/`). Building the e2e preview under the SAME subpath — rather than the
 * default `base: '/'` local dev normally gets — is deliberate: it is the only
 * way to genuinely exercise the manifest's `start_url`/`scope`, the icon
 * paths, and the service worker's `navigateFallback` resolution the way a
 * real GitHub Pages visitor hits them. A `base: '/'` build would let a
 * subpath bug (e.g. an un-prefixed icon `src`) pass unnoticed.
 */
export const REPO_NAME = 'hyrox-training'
export const BASE_PATH = `/${REPO_NAME}/`
export const PORT = 4173
export const BASE_URL = `http://localhost:${String(PORT)}${BASE_PATH}`
