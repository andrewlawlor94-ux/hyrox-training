import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import { getActiveGoal, getProfile, getSettings } from '@/data/repositories'
import { anchorPlan } from '@/domain/planGeneration/anchor'
import { goalTargets } from '@/domain/milestones/goalTargets'
import { formatDuration, formatPace, parseRaceTime } from '@/domain/units/format'
import { renderApp } from '@/test/renderApp'

/**
 * Local calendar date components (not a UTC ISO string) so the faked clock
 * lands on the same LOCAL day `useToday` reports regardless of this
 * machine's UTC offset — matches the real Monday `TEST_TODAY` below.
 */
const FAKE_NOW = new Date(2026, 2, 2, 12, 0, 0)
const TEST_TODAY = '2026-03-02'

const SHORT_RACE_DATE = '2026-05-11' // ~10 weeks out -> shortPlan warning
const BASE_WEEKS_RACE_DATE = '2026-09-14' // ~29 weeks out -> Base-weeks fill, no warning
const DEFERRED_RACE_DATE = '2026-12-07' // ~41 weeks out -> deferred start
const EXACT_24_WEEK_RACE_DATE = '2026-08-10' // exactly 24 weeks out -> no Base weeks, week 24 is race week

const TEST_AGE = 34
const TEST_HEIGHT_IN = 70
const TEST_WEIGHT_LB = 180

function setRaceDateInput(value: string): void {
  fireEvent.change(screen.getByLabelText(/race date/i), { target: { value } })
}

/**
 * jsdom does not resolve CSS custom properties in `getComputedStyle`
 * (verified empirically for the shell tests) — a rule using `font-size:
 * var(--input-font-size)` reports back the literal string, never a
 * resolved pixel value. This resolves it by hand against the root's own
 * computed custom property, the same technique `shell.test.tsx` uses for
 * the tap-target check, so the assertion can actually fail if the CSS
 * forgot to size the input at all.
 */
function resolvedPx(element: Element, property: string): number {
  const raw = getComputedStyle(element).getPropertyValue(property).trim()
  const varMatch = /^var\((--[\w-]+)\)$/.exec(raw)
  const varName = varMatch?.[1]
  const value = varName ? getComputedStyle(document.documentElement).getPropertyValue(varName).trim() : raw
  return Number.parseFloat(value)
}

async function fillRequiredProfileFields(): Promise<void> {
  await userEvent.type(screen.getByLabelText(/^age/i), String(TEST_AGE))
  await userEvent.type(screen.getByLabelText(/height/i), String(TEST_HEIGHT_IN))
  await userEvent.type(screen.getByLabelText(/weight/i), String(TEST_WEIGHT_LB))
}

async function goToProfileStep(raceDate: string): Promise<void> {
  setRaceDateInput(raceDate)
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  await screen.findByRole('heading', { name: /profile/i })
}

async function goToGoalStep(raceDate: string): Promise<void> {
  await goToProfileStep(raceDate)
  await fillRequiredProfileFields()
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  await screen.findByRole('heading', { name: /goal/i })
}

beforeEach(async () => {
  await resetDatabase()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('onboarding', () => {
  it('renders the three steps in order, with a back control on steps 2 and 3 only', async () => {
    renderApp({ route: '/onboarding' })
    await screen.findByRole('heading', { name: /race date/i })
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull()

    await goToProfileStep(EXACT_24_WEEK_RACE_DATE)
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()

    // Already on the profile step — advance to goal directly rather than
    // via `goToGoalStep`, which starts from the race-date step.
    await fillRequiredProfileFields()
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await screen.findByRole('heading', { name: /goal/i })
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
  })

  it('blocks continuing with an empty race date via an inline validation message, not a silent no-op', async () => {
    renderApp({ route: '/onboarding' })
    await screen.findByRole('heading', { name: /race date/i })

    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/choose a race date/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /profile/i })).toBeNull()
  })

  it('gives every input on every step a computed font-size of at least 16px, backed by --input-font-size', async () => {
    renderApp({ route: '/onboarding' })
    await screen.findByRole('heading', { name: /race date/i })
    expect(resolvedPx(screen.getByLabelText(/race date/i), 'font-size')).toBeGreaterThanOrEqual(16)

    await goToProfileStep(EXACT_24_WEEK_RACE_DATE)
    for (const field of [
      screen.getByLabelText(/^age/i), screen.getByLabelText(/height/i),
      screen.getByLabelText(/weight/i), screen.getByLabelText(/body fat/i), screen.getByLabelText(/considerations/i),
    ]) {
      expect(resolvedPx(field, 'font-size')).toBeGreaterThanOrEqual(16)
    }

    await fillRequiredProfileFields()
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await screen.findByRole('heading', { name: /goal/i })
    for (const field of [screen.getByLabelText(/target/i), screen.getByLabelText(/stretch/i)]) {
      expect(resolvedPx(field, 'font-size')).toBeGreaterThanOrEqual(16)
    }
  })

  it('shows a warning naming the shortfall for a race date fewer than 24 weeks out, and still allows continuing', async () => {
    renderApp({ route: '/onboarding' })
    await screen.findByRole('heading', { name: /race date/i })
    setRaceDateInput(SHORT_RACE_DATE)

    const anchor = anchorPlan({ today: TEST_TODAY, raceDate: SHORT_RACE_DATE })
    await screen.findByText(/warning/i)
    expect(screen.getByText(new RegExp(String(anchor.totalWeeks), 'i'))).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await screen.findByRole('heading', { name: /profile/i })
  })

  it('shows the Base-weeks explanation for a race date more than 24 weeks out', async () => {
    renderApp({ route: '/onboarding' })
    await screen.findByRole('heading', { name: /race date/i })
    setRaceDateInput(BASE_WEEKS_RACE_DATE)

    const anchor = anchorPlan({ today: TEST_TODAY, raceDate: BASE_WEEKS_RACE_DATE })
    expect(anchor.baseWeeks).toBeGreaterThan(0)
    expect(anchor.warnings).not.toContain('startDeferred')
    await screen.findByText(new RegExp(`${String(anchor.baseWeeks)} base week`, 'i'))
  })

  it('shows the deferred-start explanation with the computed start date beyond ~32 weeks out', async () => {
    renderApp({ route: '/onboarding' })
    await screen.findByRole('heading', { name: /race date/i })
    setRaceDateInput(DEFERRED_RACE_DATE)

    const anchor = anchorPlan({ today: TEST_TODAY, raceDate: DEFERRED_RACE_DATE })
    expect(anchor.warnings).toContain('startDeferred')
    expect(anchor.deferredStartDate).not.toBeNull()
    // The explanation text and the dedicated deferred-date line both mention
    // the date, so more than one element matches — findAllByText (unlike
    // findByText) doesn't throw on multiple matches.
    const matches = await screen.findAllByText(new RegExp(anchor.deferredStartDate ?? '', 'i'))
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders empty, labelled profile fields with units and placeholders, never prefilling a personal value', async () => {
    renderApp({ route: '/onboarding' })
    await screen.findByRole('heading', { name: /race date/i })
    await goToProfileStep(EXACT_24_WEEK_RACE_DATE)

    const age = screen.getByLabelText(/^age/i)
    const height = screen.getByLabelText(/height/i)
    const weight = screen.getByLabelText(/weight/i)
    const bodyFat = screen.getByLabelText(/body fat/i)
    const considerations = screen.getByLabelText(/considerations/i)

    for (const field of [age, height, weight, bodyFat]) {
      expect(field).toHaveValue('')
      expect(field.getAttribute('placeholder')).toBeTruthy()
    }
    expect(considerations).toHaveValue('')
  })

  it('blocks continuing from the profile step when a required field is missing', async () => {
    renderApp({ route: '/onboarding' })
    await screen.findByRole('heading', { name: /race date/i })
    await goToProfileStep(EXACT_24_WEEK_RACE_DATE)

    await userEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.queryByRole('heading', { name: /goal/i })).toBeNull()
    // Scoped to the alert role, not a bare text match — the step's own
    // intro paragraph also happens to say "Age, height, and weight...".
    expect(await screen.findByRole('alert')).toHaveTextContent(/age, height, and weight/i)
  })

  it('defaults the goal step to target 1:35:00 and stretch 1:30:00, both editable', async () => {
    renderApp({ route: '/onboarding' })
    await screen.findByRole('heading', { name: /race date/i })
    await goToGoalStep(EXACT_24_WEEK_RACE_DATE)

    expect(screen.getByLabelText(/target/i)).toHaveValue('1:35:00')
    expect(screen.getByLabelText(/stretch/i)).toHaveValue('1:30:00')
  })

  it('shows derived milestones for the target time and updates them live when it changes', async () => {
    renderApp({ route: '/onboarding' })
    await screen.findByRole('heading', { name: /race date/i })
    await goToGoalStep(EXACT_24_WEEK_RACE_DATE)

    const initialTargetSeconds = parseRaceTime('1:35:00') as number
    const initial = goalTargets(initialTargetSeconds)
    await screen.findByText(formatPace(initial.compromisedKmTargetSec))
    await screen.findByText(formatDuration(initial.standalone5kTargetSec))

    const targetInput = screen.getByLabelText(/target/i)
    await userEvent.clear(targetInput)
    await userEvent.type(targetInput, '1:30:00')

    const updatedTargetSeconds = parseRaceTime('1:30:00') as number
    const updated = goalTargets(updatedTargetSeconds)
    await screen.findByText(formatPace(updated.compromisedKmTargetSec))
    await screen.findByText(formatDuration(updated.standalone5kTargetSec))
  })

  it('finishes onboarding: writes profile/goal/onboardingCompletedAt, installs the seed plan, and navigates home', async () => {
    renderApp({ route: '/onboarding' })
    await screen.findByRole('heading', { name: /race date/i })
    await goToGoalStep(EXACT_24_WEEK_RACE_DATE)

    await userEvent.click(screen.getByRole('button', { name: /finish/i }))

    // Finishing runs five sequential repository writes, including
    // materializing all 24 plan weeks — the default 1s waitFor timeout can
    // be tight under a heavily parallel full-suite run.
    await screen.findByRole('heading', { name: /home/i }, { timeout: 5000 })

    const settings = await getSettings()
    expect(settings.onboardingCompletedAt).toBeTruthy()

    const profile = await getProfile(new Date().toISOString())
    expect(profile.age).toBe(TEST_AGE)
    expect(profile.heightIn).toBe(TEST_HEIGHT_IN)
    expect(profile.weightLb).toBe(TEST_WEIGHT_LB)

    const goal = await getActiveGoal()
    expect(goal?.raceDate).toBe(EXACT_24_WEEK_RACE_DATE)
    expect(goal?.targetSeconds).toBe(parseRaceTime('1:35:00'))

    const templateCount = await db.workoutTemplates.count()
    const instances = await db.workoutInstances.toArray()
    expect(instances.length).toBe(templateCount)
    expect(instances.some((instance) => instance.weekNumber === 24)).toBe(true)
  })
})
