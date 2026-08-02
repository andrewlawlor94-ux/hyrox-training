import { expect, test, type Page } from '@playwright/test'
import { BASE_URL } from './constants'
import { completeOnboarding, horizontalOverflow, isoDateWeeksFromNow } from './helpers'

/** §UX: every touch target is at least 44x44 CSS px. */
const TAP_MIN_PX = 44
/** §UX: inputs use a >=16px font so iOS Safari does not zoom on focus. */
const INPUT_MIN_FONT_PX = 16
/** The narrowest current iPhone (SE 3rd gen / 13 mini). */
const NARROWEST_IPHONE = { width: 375, height: 667 }
/** `--content-inset`. Padding below this reads as "flush to the bezel", which is
 * the complaint this exists to prevent. */
const MIN_EDGE_PADDING_PX = 16
/** Sub-pixel slack: a 44px target can compute to 43.99 after layout rounding. */
const SLACK_PX = 0.5
/** Far enough out that `anchorPlan` reports neither `shortPlan` nor
 * `startDeferred` — same value `completeOnboarding` defaults to. */
const RACE_DATE_OFFSET_WEEKS = 26

interface UndersizedControl { selector: string; width: number; height: number }

/**
 * Every visible, enabled interactive control that is smaller than 44x44,
 * named. Measured from the rendered boxes rather than inspected as CSS rules,
 * because the defect this catches was a rule that simply never applied: `button
 * { min-height: 44px }` does not reach a `<Link>`, which renders as an `<a>`,
 * so the library link sat at ~25px tall while the stylesheet "looked right".
 *
 * Zero-area elements are skipped (nothing rendered to tap), as are `aria-hidden`
 * ones, which are decorative by declaration.
 */
async function undersizedTapTargets(page: Page): Promise<UndersizedControl[]> {
  return page.evaluate(({ minPx, slack }) => {
    const SELECTOR = 'button, a[href], [role="button"], input[type="checkbox"], input[type="radio"], summary'
    const offenders: { selector: string; width: number; height: number }[] = []

    for (const el of document.querySelectorAll(SELECTOR)) {
      if (el.closest('[aria-hidden="true"]') !== null) continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (el instanceof HTMLButtonElement && el.disabled) continue

      // A radio/checkbox is routinely visually hidden (or left at the browser's
      // 13px default) with its LABEL as the real target — the app's
      // ScaleSelector and SegmentedControl use `label[for]`, the library's
      // "Show archived" toggle wraps the input instead. Both forms of
      // association count, so measure whichever label owns this input.
      const explicitLabel = el.id !== '' ? document.querySelector(`label[for="${el.id}"]`) : null
      const target = explicitLabel ?? el.closest('label') ?? el
      const rect = target.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue

      if (rect.width < minPx - slack || rect.height < minPx - slack) {
        const classes = typeof el.className === 'string' && el.className.trim() !== ''
          ? `.${el.className.trim().split(/\s+/).join('.')}`
          : ''
        offenders.push({
          selector: `${el.tagName.toLowerCase()}${classes}`,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        })
      }
    }
    return offenders
  }, { minPx: TAP_MIN_PX, slack: SLACK_PX })
}

/** Left/right padding on the element that fills the screen for this route. */
async function edgePadding(page: Page, selector: string): Promise<{ left: number; right: number }> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) throw new Error(`No element matching "${sel}"`)
    const style = getComputedStyle(el)
    return { left: Number.parseFloat(style.paddingLeft), right: Number.parseFloat(style.paddingRight) }
  }, selector)
}

async function inputsBelowMinFontSize(page: Page): Promise<{ selector: string; fontSize: number }[]> {
  return page.evaluate((minPx) => {
    const offenders: { selector: string; fontSize: number }[] = []
    for (const el of document.querySelectorAll('input, select, textarea')) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const fontSize = Number.parseFloat(style.fontSize)
      if (fontSize < minPx) offenders.push({ selector: `${el.tagName.toLowerCase()}#${el.id}`, fontSize })
    }
    return offenders
  }, INPUT_MIN_FONT_PX)
}

// Onboarding renders OUTSIDE AppShell, so it inherits none of
// `.app-shell__main`'s insets — which is exactly how the whole three-step
// wizard came to render flush to both bezels, heading under the Dynamic Island.
test('the onboarding wizard is inset from both bezels and fully tappable at 375px', async ({ page }) => {
  await page.setViewportSize(NARROWEST_IPHONE)
  await page.goto(BASE_URL)
  await expect(page.getByRole('heading', { name: 'Race date' })).toBeVisible()

  const padding = await edgePadding(page, '.onboarding-step')
  expect(padding.left).toBeGreaterThanOrEqual(MIN_EDGE_PADDING_PX)
  expect(padding.right).toBeGreaterThanOrEqual(MIN_EDGE_PADDING_PX)

  expect(await undersizedTapTargets(page)).toEqual([])
  expect(await horizontalOverflow(page)).toEqual([])
  expect(await inputsBelowMinFontSize(page)).toEqual([])

  // Same three checks on the two remaining steps — the wizard's later steps are
  // separate renders of `.onboarding-step`, not the same DOM re-labelled.
  await page.getByLabel('Race date').fill(isoDateWeeksFromNow(RACE_DATE_OFFSET_WEEKS))
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  expect(await undersizedTapTargets(page)).toEqual([])
  expect(await horizontalOverflow(page)).toEqual([])
  expect(await inputsBelowMinFontSize(page)).toEqual([])

  await page.getByLabel(/^age/i).fill('34')
  await page.getByLabel(/^height/i).fill('70')
  await page.getByLabel(/^weight/i).fill('180')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Goal' })).toBeVisible()
  expect(await undersizedTapTargets(page)).toEqual([])
  expect(await horizontalOverflow(page)).toEqual([])
  expect(await inputsBelowMinFontSize(page)).toEqual([])
})

test('every in-app screen is tappable, inset, and free of overflow at 375px', async ({ page }) => {
  await page.setViewportSize(NARROWEST_IPHONE)
  await completeOnboarding(page)

  const padding = await edgePadding(page, '.app-shell__main')
  expect(padding.left).toBeGreaterThanOrEqual(MIN_EDGE_PADDING_PX)
  expect(padding.right).toBeGreaterThanOrEqual(MIN_EDGE_PADDING_PX)

  const auditCurrentScreen = async (label: string): Promise<void> => {
    expect(await undersizedTapTargets(page), `${label}: undersized tap targets`).toEqual([])
    expect(await horizontalOverflow(page), `${label}: horizontal overflow`).toEqual([])
    expect(await inputsBelowMinFontSize(page), `${label}: inputs below 16px`).toEqual([])
  }

  await auditCurrentScreen('Home')

  // Calendar included deliberately: a seven-column month grid is the densest
  // layout in the app, and its day cells are exactly where a 44px tap target is
  // hardest to keep.
  for (const tab of ['Calendar', 'Plan', 'Progress', 'Settings']) {
    await page.getByRole('link', { name: tab, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: tab })).toBeVisible({ timeout: 15_000 })
    await auditCurrentScreen(tab)
  }

  // Library is reached from Settings, not the tab bar — and "Open exercise
  // library" is precisely the `<a class="btn">` that rendered ~25px tall,
  // because `button { min-height: 44px }` never reaches an anchor.
  await page.getByRole('link', { name: 'Open exercise library' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible({ timeout: 15_000 })
  await auditCurrentScreen('Library')
})
