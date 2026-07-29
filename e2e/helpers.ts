import { expect, type Locator, type Page } from '@playwright/test'
import { BASE_URL } from './constants'

const DAYS_PER_WEEK = 7
const DATE_FIELD_WIDTH = 2
/** How far out the onboarding helper picks a race date by default — enough
 * to generate a couple of Base weeks ahead of the 24-week core plan (see
 * `src/domain/planGeneration/anchor.ts`) without tripping its `shortPlan` or
 * `startDeferred` warnings. */
const DEFAULT_RACE_DATE_OFFSET_WEEKS = 26

/**
 * `YYYY-MM-DD` for `weeks` weeks from the real current date — suitable for
 * an `<input type="date">`'s `.fill()`. Deliberately reads the real wall
 * clock rather than a mocked one: this whole suite is meant to exercise the
 * app the way an athlete's actual phone would, on whatever real day it runs.
 */
export function isoDateWeeksFromNow(weeks: number): string {
  const date = new Date()
  date.setDate(date.getDate() + weeks * DAYS_PER_WEEK)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(DATE_FIELD_WIDTH, '0')
  const day = String(date.getDate()).padStart(DATE_FIELD_WIDTH, '0')
  return `${String(year)}-${month}-${day}`
}

export interface OnboardingProfile {
  age: number
  heightIn: number
  weightLb: number
}

/** Neutral, non-personal placeholder values (this is a public repository) —
 * the same shape as the field placeholders (`e.g. 34`, `e.g. 70`, `e.g. 180`). */
const DEFAULT_PROFILE: OnboardingProfile = { age: 34, heightIn: 70, weightLb: 180 }

/**
 * Drives the full onboarding wizard exactly the way an athlete would: a race
 * date, a neutral profile, and the prefilled default goal (1:35:00 target /
 * 1:30:00 stretch) accepted untouched. Ends on Home — `installSeedPlan`
 * materializes the whole 24-week plan synchronously with the "Finish" click,
 * so this waits generously rather than assuming a fixed delay.
 */
export async function completeOnboarding(
  page: Page,
  options: { raceDateOffsetWeeks?: number; profile?: OnboardingProfile } = {},
): Promise<void> {
  const raceDateOffsetWeeks = options.raceDateOffsetWeeks ?? DEFAULT_RACE_DATE_OFFSET_WEEKS
  const profile = options.profile ?? DEFAULT_PROFILE

  await page.goto(BASE_URL)
  await expect(page.getByRole('heading', { name: 'Race date' })).toBeVisible()
  await page.getByLabel('Race date').fill(isoDateWeeksFromNow(raceDateOffsetWeeks))
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  await page.getByLabel(/^age/i).fill(String(profile.age))
  await page.getByLabel(/^height/i).fill(String(profile.heightIn))
  await page.getByLabel(/^weight/i).fill(String(profile.weightLb))
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Goal' })).toBeVisible()
  // Both fields already carry the plan's default (1:35:00 / 1:30:00) —
  // accepted untouched, exactly as an athlete happy with the default would.
  await page.getByRole('button', { name: 'Finish' }).click()

  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 20_000 })
}

/**
 * Reads every row of one IndexedDB object store directly through the native
 * `indexedDB` API — mirrors `src/data/db.ts`'s own `exportRawSnapshot` —
 * bypassing Dexie AND the UI entirely, so an assertion on "the database row"
 * can never be satisfied by a stale or optimistic UI re-display instead of
 * what was actually persisted.
 */
export async function readStore<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate((name) => new Promise<T[]>((resolve, reject) => {
    const request = indexedDB.open('hyrox-training')
    request.onerror = () => { reject(request.error ?? new Error('Unable to open IndexedDB')) }
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(name)) { db.close(); resolve([]); return }
      const tx = db.transaction(name, 'readonly')
      const getAll = tx.objectStore(name).getAll()
      getAll.onsuccess = () => { resolve(getAll.result as T[]); db.close() }
      getAll.onerror = () => { reject(getAll.error ?? new Error(`Unable to read store "${name}"`)); db.close() }
    }
  }), storeName)
}

const DURATION_PARTS_WITH_HOURS = 3
const SEC_PER_MIN = 60
const SEC_PER_HOUR = 3600

/**
 * Inverse of `src/domain/units/format.ts`'s `formatDuration` — turns a
 * rendered "2:30" or "1:02:30" back into whole seconds so the rest timer's
 * on-screen countdown can be asserted numerically (a real remainder in a
 * tolerance window) rather than only string-matched.
 */
export function parseDurationText(text: string): number {
  const parts = text.trim().split(':').map((part) => Number.parseInt(part, 10))
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Not a recognizable duration: "${text}"`)
  }
  if (parts.length === DURATION_PARTS_WITH_HOURS) {
    const [hours, minutes, seconds] = parts as [number, number, number]
    return hours * SEC_PER_HOUR + minutes * SEC_PER_MIN + seconds
  }
  const [minutes, seconds] = parts as [number, number]
  return minutes * SEC_PER_MIN + seconds
}

/**
 * Scopes to one exercise's own card (`Card as="article"`) by its name — every
 * set-row control ("Complete set 1", "Weight, set 1", ...) repeats identically
 * per exercise, so an unscoped `getByRole`/`getByLabel` for those matches
 * every exercise at once. This is the same disambiguation Playwright's own
 * strict-mode error suggests.
 */
export function exerciseCard(page: Page, exerciseName: string): Locator {
  return page.locator('article').filter({ has: page.getByRole('heading', { name: exerciseName, exact: true }) })
}

/** One element that is wider than the space it has, named well enough to fix. */
export interface OverflowOffender {
  selector: string
  /** `'viewport'` — the element's box extends past the right edge of the
   * viewport. `'clipped'` — the element's own content is wider than its box and
   * it declares no horizontal scroller, so that content is silently cut off. */
  kind: 'viewport' | 'clipped'
  width: number
  limit: number
}

/**
 * Finds elements that actually overflow horizontally, and names them.
 *
 * The obvious check — `documentElement.scrollWidth > clientWidth` — CANNOT FAIL
 * in this app and so proved nothing: `body { overflow-x: hidden }` clamps the
 * document's scroll width to the viewport, and `.app-shell__main` (not the
 * document) is the real scroll container. Overflow here does not produce a
 * scrollbar to detect; it produces content the athlete can never reach. So
 * measure the elements themselves:
 *
 * - `viewport`: the element's box extends past the viewport's right edge.
 * - `clipped`: the element's content is wider than its box while its computed
 *   `overflow-x` is neither `auto` nor `scroll` — i.e. nothing is scrollable
 *   and the excess is simply gone. Deliberate scrollers (a wide chart or
 *   table in an `overflow-x: auto` wrapper) are exempt by that same test.
 *
 * Three exemptions from `clipped`, each because overflow there is not a layout
 * defect (all verified against this app, not assumed):
 * - form controls (`input`/`textarea`/`select`), whose text content scrolls
 *   natively whenever the typed value is longer than the field;
 * - boxes under 2px wide, which cannot display anything either way — this is
 *   what the `.visually-hidden` screen-reader pattern (`width: 1px` + `clip`)
 *   deliberately looks like;
 * - `text-overflow: ellipsis`, which is an explicit decision to truncate.
 *
 * The `+ 1` slack absorbs sub-pixel rounding, and zero-area / `display: none`
 * / `visibility: hidden` elements are skipped since they render nothing.
 */
export async function horizontalOverflow(page: Page): Promise<OverflowOffender[]> {
  return page.evaluate(() => {
    const SLACK_PX = 1
    /** Below this width a box shows nothing, so "its content is wider" is
     * meaningless — see the `.visually-hidden` exemption. */
    const MIN_MEANINGFUL_WIDTH_PX = 2
    const NATIVELY_SCROLLING_TAGS = ['input', 'textarea', 'select']
    const viewport = document.documentElement.clientWidth
    const offenders: { selector: string; kind: 'viewport' | 'clipped'; width: number; limit: number }[] = []

    const describe = (el: Element): string => {
      const classes = typeof el.className === 'string' && el.className.trim().length > 0
        ? `.${el.className.trim().split(/\s+/).join('.')}`
        : ''
      return `${el.tagName.toLowerCase()}${classes}`
    }

    for (const el of document.querySelectorAll('body, body *')) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue

      if (rect.right > viewport + SLACK_PX) {
        offenders.push({ selector: describe(el), kind: 'viewport', width: Math.round(rect.right), limit: viewport })
      }
      const exemptFromClipped = style.overflowX === 'auto' || style.overflowX === 'scroll'
        || style.textOverflow === 'ellipsis'
        || NATIVELY_SCROLLING_TAGS.includes(el.tagName.toLowerCase())
        || el.clientWidth < MIN_MEANINGFUL_WIDTH_PX
      if (!exemptFromClipped && el.scrollWidth > el.clientWidth + SLACK_PX) {
        offenders.push({ selector: describe(el), kind: 'clipped', width: el.scrollWidth, limit: el.clientWidth })
      }
    }
    return offenders
  })
}
