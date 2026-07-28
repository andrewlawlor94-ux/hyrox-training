import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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

export default defineConfig({
  // Deployed under a repository subpath on GitHub Pages; '/' for local dev.
  base: process.env['VITE_BASE'] ?? '/',
  plugins: [react(), spaFallback()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
