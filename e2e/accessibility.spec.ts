import { expect, test, type Page } from '@playwright/test'
import { completeOnboarding, exerciseCard, readStore } from './helpers'

/**
 * The rest of §UX's mobile rules, the ones nothing else measured: "visible focus
 * rings, full keyboard operability of set completion and navigation" and "target
 * WCAG AA contrast". Tap-target size, 16px inputs, safe-area insets and
 * horizontal overflow live in mobileLayout.spec.ts.
 */

/** WCAG AA: 4.5:1 for body text, 3:1 for large text. */
const AA_NORMAL_RATIO = 4.5
const AA_LARGE_RATIO = 3
/** WCAG's own definition of "large": >=24px, or >=18.66px when bold. */
const LARGE_PX = 24
const LARGE_BOLD_PX = 18.66
const BOLD_WEIGHT = 700
/** A focus ring thinner than this is not a visible indicator. */
const MIN_FOCUS_OUTLINE_PX = 1
/**
 * Bound on the tab walk. Generous on purpose: the workout screen is genuinely
 * control-dense (measured — the bottom nav is ~56 tab stops past the first
 * control, and completing a set adds the rest-timer bar's four), so a tight
 * bound fails on legitimate density rather than on a defect. It exists only so
 * a trapped focus fails fast instead of hanging.
 */
const MAX_TAB_STOPS = 150

interface ContrastOffender {
  selector: string
  text: string
  ratio: number
  required: number
  color: string
  background: string
}

interface StrengthSetRow { instanceId: string; setIndex: number; weight?: number; reps?: number; isCompleted: boolean }

/**
 * Every element that directly contains visible text whose contrast against its
 * effective background is below AA.
 *
 * "Effective background" means walking ancestors until a non-transparent
 * background colour is found, which is what the athlete actually sees — a
 * literal `getComputedStyle(el).backgroundColor` is `rgba(0,0,0,0)` on almost
 * every text element and would make this pass vacuously. Elements whose own
 * colour or background carries partial alpha are reported rather than silently
 * skipped, since a wrong answer there is worse than a flagged one.
 */
async function belowAAContrast(page: Page): Promise<ContrastOffender[]> {
  return page.evaluate((limits) => {
    // Declared INSIDE the callback because `page.evaluate` serializes this
    // function and runs it in the page: nothing from the enclosing module scope
    // is reachable here. Every value is straight from WCAG 2.1's relative
    // luminance and contrast-ratio definitions.
    const SRGB_MAX = 255
    const LINEAR_THRESHOLD = 0.03928
    const LINEAR_DIVISOR = 12.92
    const GAMMA_OFFSET = 0.055
    const GAMMA_SCALE = 1.055
    const GAMMA_EXPONENT = 2.4
    const LUMA_R = 0.2126
    const LUMA_G = 0.7152
    const LUMA_B = 0.0722
    const CONTRAST_FLARE = 0.05
    const RATIO_DECIMALS = 100
    const TEXT_SAMPLE_CHARS = 40

    const parseRgb = (value: string): [number, number, number, number] | null => {
      const match = /^rgba?\(([^)]+)\)$/.exec(value.trim())
      if (!match?.[1]) return null
      const parts = match[1].split(/[,\s/]+/).filter((p) => p !== '').map(Number)
      const [r, g, b, a] = parts
      if (r === undefined || g === undefined || b === undefined) return null
      return [r, g, b, a ?? 1]
    }

    // WCAG relative luminance.
    const luminance = ([r, g, b]: [number, number, number]): number => {
      const channel = (v: number): number => {
        const s = v / SRGB_MAX
        return s <= LINEAR_THRESHOLD ? s / LINEAR_DIVISOR : Math.pow((s + GAMMA_OFFSET) / GAMMA_SCALE, GAMMA_EXPONENT)
      }
      return LUMA_R * channel(r) + LUMA_G * channel(g) + LUMA_B * channel(b)
    }

    const ratio = (fg: [number, number, number], bg: [number, number, number]): number => {
      const l1 = luminance(fg)
      const l2 = luminance(bg)
      return (Math.max(l1, l2) + CONTRAST_FLARE) / (Math.min(l1, l2) + CONTRAST_FLARE)
    }

    /** Composites a partially transparent colour over its backdrop. */
    const over = (top: [number, number, number, number], bottom: [number, number, number]): [number, number, number] => [
      Math.round(top[0] * top[3] + bottom[0] * (1 - top[3])),
      Math.round(top[1] * top[3] + bottom[1] * (1 - top[3])),
      Math.round(top[2] * top[3] + bottom[2] * (1 - top[3])),
    ]

    const WHITE: [number, number, number] = [SRGB_MAX, SRGB_MAX, SRGB_MAX]

    const effectiveBackground = (start: Element): [number, number, number] => {
      let node: Element | null = start
      while (node !== null) {
        const parsed = parseRgb(getComputedStyle(node).backgroundColor)
        if (parsed !== null && parsed[3] > 0) {
          const [r, g, b, a] = parsed
          if (a >= 1) return [r, g, b]
          const behind = node.parentElement === null ? WHITE : effectiveBackground(node.parentElement)
          return over([r, g, b, a], behind)
        }
        node = node.parentElement
      }
      // Nothing opaque anywhere up the tree: the canvas itself, which is white.
      return WHITE
    }

    const describe = (el: Element): string => {
      const classes = typeof el.className === 'string' && el.className.trim() !== ''
        ? `.${el.className.trim().split(/\s+/).join('.')}`
        : ''
      return `${el.tagName.toLowerCase()}${classes}`
    }

    const offenders: ContrastOffender[] = []

    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
      if (el.closest('.visually-hidden') !== null) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      // Only elements holding their OWN text: otherwise every wrapper is scored
      // against text it merely contains, and one real failure reports 12 times.
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim()
      if (ownText === '') continue

      const fg = parseRgb(style.color)
      if (fg === null) continue
      const bg = effectiveBackground(el)
      const composited = fg[3] >= 1 ? [fg[0], fg[1], fg[2]] as [number, number, number] : over(fg, bg)

      const fontPx = Number.parseFloat(style.fontSize)
      const weight = Number(style.fontWeight)
      const isLarge = fontPx >= limits.largePx || (fontPx >= limits.largeBoldPx && weight >= limits.boldWeight)
      const required = isLarge ? limits.largeRatio : limits.normalRatio

      const actual = ratio(composited, bg)
      if (actual < required) {
        offenders.push({
          selector: describe(el),
          text: ownText.slice(0, TEXT_SAMPLE_CHARS),
          ratio: Math.round(actual * RATIO_DECIMALS) / RATIO_DECIMALS,
          required,
          color: style.color,
          background: `rgb(${String(bg[0])}, ${String(bg[1])}, ${String(bg[2])})`,
        })
      }
    }
    return offenders
  }, {
    normalRatio: AA_NORMAL_RATIO,
    largeRatio: AA_LARGE_RATIO,
    largePx: LARGE_PX,
    largeBoldPx: LARGE_BOLD_PX,
    boldWeight: BOLD_WEIGHT,
  })
}

/** Tabs forward until `predicate` matches the focused element, returning how
 * many stops it took, or `null` if it was never reachable. */
async function tabUntilFocused(page: Page, predicate: (info: { tag: string; label: string }) => boolean): Promise<number | null> {
  for (let stops = 1; stops <= MAX_TAB_STOPS; stops += 1) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement
      if (el === null) return { tag: '', label: '' }
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
      }
    })
    if (predicate(info)) return stops
  }
  return null
}

test('completing a set and navigating are fully keyboard-operable, with a visible focus ring', async ({ page }) => {
  await completeOnboarding(page)
  await page.getByRole('button', { name: 'Start' }).first().click()
  await expect(page.getByRole('heading', { name: /Week \d+ · Session \d+/ })).toBeVisible()

  const firstExerciseName = (await page.locator('article h2, article h3').first().innerText()).trim()
  const card = exerciseCard(page, firstExerciseName)
  const completeButton = card.getByRole('button', { name: 'Complete set 1' })
  await expect(completeButton).toBeVisible()

  // Reachable by Tab alone — no mouse, no scripted .focus().
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur() })
  const stops = await tabUntilFocused(page, (info) => info.label === 'Complete set 1')
  expect(stops, 'Complete set 1 must be reachable by Tab').not.toBeNull()

  // Keyboard focus must show a ring. Read after a real Tab, so :focus-visible
  // genuinely applies — a scripted .focus() does not always trigger it.
  const focusRing = await page.evaluate(() => {
    const el = document.activeElement
    if (el === null) return { width: 0, style: 'none', boxShadow: 'none' }
    const s = getComputedStyle(el)
    return { width: Number.parseFloat(s.outlineWidth), style: s.outlineStyle, boxShadow: s.boxShadow }
  })
  const hasRing = (focusRing.width >= MIN_FOCUS_OUTLINE_PX && focusRing.style !== 'none') || focusRing.boxShadow !== 'none'
  expect(hasRing, `focused control has no visible ring: ${JSON.stringify(focusRing)}`).toBe(true)

  // Space activates it — assert against the IndexedDB row, not the button's own
  // label, so this cannot pass on a UI change that persisted nothing.
  await page.keyboard.press(' ')
  await expect(card.getByRole('button', { name: 'Undo set 1' })).toBeVisible()
  const sets = await readStore<StrengthSetRow>(page, 'strengthSets')
  expect(sets.filter((s) => s.isCompleted).length).toBeGreaterThan(0)

  // Navigation by keyboard: reach a tab and activate it with Enter.
  const navStops = await tabUntilFocused(page, (info) => info.tag === 'a' && info.label === 'Progress')
  expect(navStops, 'the Progress tab must be reachable by Tab').not.toBeNull()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible({ timeout: 15_000 })
})

test('text meets WCAG AA contrast on every screen', async ({ page }) => {
  await completeOnboarding(page)
  expect(await belowAAContrast(page), 'Home').toEqual([])

  for (const tab of ['Calendar', 'Plan', 'Progress', 'Settings']) {
    await page.getByRole('link', { name: tab, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: tab })).toBeVisible({ timeout: 15_000 })
    expect(await belowAAContrast(page), tab).toEqual([])
  }

  await page.getByRole('link', { name: 'Open exercise library' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible({ timeout: 15_000 })
  expect(await belowAAContrast(page), 'Library').toEqual([])
})
