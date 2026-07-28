// vite.config.ts pulls in `vite`/`@vitejs/plugin-react`, which lazily loads
// `esbuild`. esbuild's own module-load self-check
// (`new TextEncoder().encode('') instanceof Uint8Array`) trips inside a
// jsdom global environment because jsdom's `Uint8Array` is a different
// realm's constructor than the one `TextEncoder` produces — a documented
// esbuild/jsdom incompatibility, not a real environment break. This file
// needs no DOM at all, so it opts back into the plain Node environment
// (every other test file keeps vitest.config.ts's project-wide `jsdom`
// default) and sidesteps the mismatch entirely.
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ManifestOptions, VitePWAOptions } from 'vite-plugin-pwa'
import { buildPwaOptions } from '../../vite.config'

const ROOT_BASE = '/'
const SUBPATH_BASE = '/hyrox-training/'

/** `manifest` is typed as `Partial<ManifestOptions> | false | undefined` on
 * the options object — every test here needs a real manifest, so fail loudly
 * (not silently pass) if one isn't there. */
function manifestOf(options: Partial<VitePWAOptions>): Partial<ManifestOptions> {
  const { manifest } = options
  if (!manifest) throw new Error('Expected buildPwaOptions() to return a manifest object')
  return manifest
}

describe('vite.config PWA options', () => {
  it('registers with a user-driven prompt, never a silent autoUpdate (D9)', () => {
    const options = buildPwaOptions(ROOT_BASE)
    expect(options.registerType).toBe('prompt')
    expect(options.registerType).not.toBe('autoUpdate')
  })

  it('sets the manifest display mode, orientation, and colors', () => {
    const manifest = manifestOf(buildPwaOptions(ROOT_BASE))
    expect(manifest.display).toBe('standalone')
    expect(manifest.orientation).toBe('portrait')
    expect(manifest.theme_color).toBe('#FFFFFF')
    expect(manifest.background_color).toBe('#FFFFFF')
  })

  it('derives start_url and scope from the configured base at the app root', () => {
    const manifest = manifestOf(buildPwaOptions(ROOT_BASE))
    expect(manifest.start_url).toBe(ROOT_BASE)
    expect(manifest.scope).toBe(ROOT_BASE)
  })

  it('derives start_url, scope, and base itself from a deployed repository subpath', () => {
    const options = buildPwaOptions(SUBPATH_BASE)
    const manifest = manifestOf(options)
    expect(options.base).toBe(SUBPATH_BASE)
    expect(manifest.start_url).toBe(SUBPATH_BASE)
    expect(manifest.scope).toBe(SUBPATH_BASE)
  })

  it('includes non-empty manifest icons covering 192, 512, and a 512 maskable entry', () => {
    const manifest = manifestOf(buildPwaOptions(ROOT_BASE))
    const icons = manifest.icons ?? []
    // Guard against a vacuously-true "every icon..." check below: this must
    // actually find icons, not just find none to iterate over.
    expect(icons.length).toBeGreaterThan(0)

    const has192 = icons.some((icon) => icon.sizes === '192x192' && icon.purpose === undefined)
    const has512 = icons.some((icon) => icon.sizes === '512x512' && icon.purpose === undefined)
    const has512Maskable = icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')
    expect(has192).toBe(true)
    expect(has512).toBe(true)
    expect(has512Maskable).toBe(true)
  })

  it('carries the deployed subpath into every icon src', () => {
    const manifest = manifestOf(buildPwaOptions(SUBPATH_BASE))
    const icons = manifest.icons ?? []
    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) {
      expect(icon.src.startsWith(SUBPATH_BASE)).toBe(true)
    }
  })

  it('globs cover every static asset type the app ships (js, css, html, svg, png, woff2)', () => {
    const options = buildPwaOptions(ROOT_BASE)
    const patterns = options.workbox?.globPatterns ?? []
    expect(patterns.length).toBeGreaterThan(0)
    const joined = patterns.join(',')
    for (const ext of ['js', 'css', 'html', 'svg', 'png', 'woff2']) {
      expect(joined.includes(ext)).toBe(true)
    }
  })

  it('sets navigateFallback so refreshing a deep route works offline', () => {
    const options = buildPwaOptions(ROOT_BASE)
    expect(options.workbox?.navigateFallback).toBeTruthy()
  })

  it('never points a runtime caching rule at an external origin (offline-only app)', () => {
    const options = buildPwaOptions(ROOT_BASE)
    // Pinned to the exact expected value (not just "every rule passes some
    // external-origin check") so this can't pass vacuously if the field were
    // ever left undefined instead of deliberately empty.
    expect(options.workbox?.runtimeCaching ?? []).toEqual([])
  })
})
