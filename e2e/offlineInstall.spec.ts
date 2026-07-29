import { expect, test } from '@playwright/test'
import { BASE_PATH, BASE_URL } from './constants'
import { completeOnboarding } from './helpers'

interface ManifestIcon {
  src: string
  sizes: string
  type: string
}

interface WebManifest {
  start_url: string
  scope: string
  icons: ManifestIcon[]
}

const HTTP_OK = 200

test('serves an installable manifest, and renders offline including a deep-route reload', async ({ page, context }) => {
  await completeOnboarding(page)

  // The service worker actually activates -- not just "registration didn't throw".
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration()
    .then((reg) => reg?.active?.state === 'activated'))

  // The manifest is served with a real subpath-carrying start_url/scope (this
  // build's `VITE_BASE` mirrors the GitHub Pages deploy, see e2e/constants.ts)
  // and every icon it references actually resolves.
  const manifestResponse = await page.request.get(`${BASE_URL}manifest.webmanifest`)
  expect(manifestResponse.status()).toBe(HTTP_OK)
  const manifest = await manifestResponse.json() as WebManifest
  expect(manifest.start_url).toBe(BASE_PATH)
  expect(manifest.scope).toBe(BASE_PATH)
  expect(manifest.icons.length).toBeGreaterThan(0)
  for (const icon of manifest.icons) {
    const iconResponse = await page.request.get(new URL(icon.src, BASE_URL).toString())
    expect(iconResponse.status()).toBe(HTTP_OK)
  }

  // Now go fully offline and reload -- Home must still render straight from
  // the service worker's cache, with zero network available.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: "Today's workout" })).toBeVisible()

  // Client-side tab navigation keeps working offline (no fetch involved once
  // the SPA bundle itself is cached).
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await nav.getByRole('link', { name: 'Progress' }).click()
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()

  await nav.getByRole('link', { name: 'Plan' }).click()
  await expect(page.getByRole('heading', { name: 'Plan' })).toBeVisible()

  // A hard reload on this deep, lazy-loaded route while offline is the real
  // `navigateFallback` path -- a plain `fetch()` can't exercise this because
  // it isn't a navigation request, but a full page reload is.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Plan' })).toBeVisible({ timeout: 15_000 })

  await nav.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await context.setOffline(false)
})
