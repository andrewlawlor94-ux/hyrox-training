import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { IconResource, VitePWAOptions } from 'vite-plugin-pwa'

const APP_NAME = 'HYROX Training'
const APP_SHORT_NAME = 'HYROX'
const APP_DESCRIPTION = 'Offline, local-only 24-week HYROX race-training tracker.'

// Matches index.html's existing <meta name="theme-color"> and
// src/styles/tokens.css's --bg — the app has no branded theme colour of its
// own, just a plain white chrome.
const THEME_COLOR = '#FFFFFF'

const ICON_SIZE_STANDARD = 192
const ICON_SIZE_LARGE = 512

/**
 * Every icon `src` is base-prefixed by hand: vite-plugin-pwa does NOT rewrite
 * manifest icon paths to carry Vite's `base` the way it rewrites index.html's
 * own asset tags, so an icon list built from a bare filename would 404 the
 * moment the app is served from a GitHub Pages repository subpath (see
 * scripts/generate-icons.mjs for how these four files are produced).
 */
function buildManifestIcons(base: string): IconResource[] {
  return [
    { src: `${base}icon-192.png`, sizes: `${ICON_SIZE_STANDARD}x${ICON_SIZE_STANDARD}`, type: 'image/png' },
    { src: `${base}icon-512.png`, sizes: `${ICON_SIZE_LARGE}x${ICON_SIZE_LARGE}`, type: 'image/png' },
    {
      src: `${base}icon-512-maskable.png`,
      sizes: `${ICON_SIZE_LARGE}x${ICON_SIZE_LARGE}`,
      type: 'image/png',
      purpose: 'maskable',
    },
  ]
}

/**
 * The PWA plugin's options, factored out as a pure function of `base` so
 * src/__tests__/pwaConfig.test.ts can assert on them directly without
 * re-implementing Vite's own config-resolution pipeline.
 *
 * `registerType: 'prompt'` is deliberate, not the plugin's own default read
 * off a comment (D9): `autoUpdate` lets a new service worker take over and
 * reload the page on its own, which could swap the app out from under an
 * athlete mid-set. `'prompt'` makes the new worker install and then WAIT —
 * src/pwa.ts and src/features/shell/UpdatePrompt.tsx are the only things
 * that ever tell it to proceed.
 *
 * The app is offline-only by design (no backend, CDN, fonts, or analytics),
 * so `workbox.runtimeCaching` stays empty — there is nothing at another
 * origin worth (or safe) to cache.
 */
export function buildPwaOptions(base: string): Partial<VitePWAOptions> {
  return {
    registerType: 'prompt',
    base,
    manifest: {
      name: APP_NAME,
      short_name: APP_SHORT_NAME,
      description: APP_DESCRIPTION,
      start_url: base,
      scope: base,
      display: 'standalone',
      orientation: 'portrait',
      theme_color: THEME_COLOR,
      background_color: THEME_COLOR,
      icons: buildManifestIcons(base),
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      // Deliberately NOT base-prefixed: workbox resolves this path relative
      // to the service worker's own script location (already under `base`
      // once deployed), so prefixing it a second time here would point the
      // fallback at the wrong URL under a subpath deployment.
      navigateFallback: 'index.html',
      runtimeCaching: [],
    },
  }
}

/**
 * GitHub Pages serves a static bucket with no SPA rewrite, so refreshing a deep
 * route (or reopening an installed PWA on one) would 404. Pages does serve
 * 404.html for unmatched paths, so shipping a byte-identical copy of index.html
 * under that name makes client-side routing survive a hard refresh.
 */
function spaFallback(): Plugin {
  return {
    name: 'hyrox-spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist', import.meta.url))
      const index = `${dist}/index.html`
      if (existsSync(index)) copyFileSync(index, `${dist}/404.html`)
    },
  }
}

// Deployed under a repository subpath on GitHub Pages; '/' for local dev.
const base = process.env['VITE_BASE'] ?? '/'

export default defineConfig({
  base,
  plugins: [react(), spaFallback(), VitePWA(buildPwaOptions(base))],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
