import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db, resetDatabase } from '@/data/db'
import { updateSettings, updateStandard } from '@/data/repositories'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import { renderApp } from '@/test/renderApp'

const TODAY = '2026-08-24' // Monday
const NOW = '2026-08-24T09:00:00.000Z'
const FAKE_NOW = new Date(2026, 7, 24, 9, 0, 0)

const ALL_STATION_EXERCISE_IDS = [
  'ex_ski_erg', 'ex_sled_push', 'ex_sled_pull', 'ex_burpee_broad_jump',
  'ex_row', 'ex_farmer_carry', 'ex_sandbag_lunge', 'ex_wall_ball',
]

let instanceCounter = 0

async function createStationWorkout(exerciseIds: string[]): Promise<string> {
  instanceCounter += 1
  const instanceId = `wi_station_${String(instanceCounter)}`
  const templateId = `tmpl_station_${String(instanceCounter)}`
  await db.workoutTemplates.add({
    id: templateId, planId: 'plan_test', planWeekId: 'week_test', sessionSlot: 1, sequenceInWeek: 1,
    name: 'Station circuit', kind: 'hybrid', priority: 'essential', recoveryTags: [], estMinutes: 45, notes: '',
  })
  await db.workoutInstances.add({
    id: instanceId, planId: 'plan_test', templateId, weekNumber: 1, sessionSlot: 1,
    plannedDate: TODAY, scheduledDate: TODAY, sequence: 1, priority: 'essential',
    recoveryTags: [], status: 'available', isManualOverride: false, frozen: false,
  })
  let order = 0
  for (const exerciseId of exerciseIds) {
    order += 1
    await db.instancePrescriptions.add({
      id: `ip_station_${String(instanceCounter)}_${String(order)}`, instanceId, templateId, exerciseId, order, restSec: 60,
    })
  }
  return instanceId
}

async function setup(): Promise<void> {
  await resetDatabase()
  await seedIfEmpty(db, NOW)
  await updateSettings({ onboardingCompletedAt: NOW })
}

async function renderWorkout(instanceId: string): Promise<void> {
  renderApp({ route: `/workout/${instanceId}` })
  await screen.findByRole('heading', { level: 1 })
}

beforeEach(async () => {
  await setup()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('station logging', () => {
  it('renders all eight stations with correct labels', async () => {
    const instanceId = await createStationWorkout(ALL_STATION_EXERCISE_IDS)
    await renderWorkout(instanceId)

    for (const name of ['SkiErg', 'Sled push', 'Sled pull', 'Burpee broad jump', 'Row', 'Farmer carry', 'Sandbag lunge', 'Wall ball']) {
      expect(await screen.findByText(name)).toBeInTheDocument()
    }
  })

  it('renders distance, reps, load, time, breaks, RPE, set/break structure, notes, and technique notes', async () => {
    const instanceId = await createStationWorkout(['ex_sled_push'])
    await renderWorkout(instanceId)

    expect(await screen.findByLabelText(/distance/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^reps/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^load/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^time/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/breaks/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rpe/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/set\/break structure/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^notes/i)).toBeInTheDocument()
    expect(screen.getByText(/Technique:/)).toBeInTheDocument()
  })

  it('shows the seeded Men\'s Open standard as the reference, including the kg/lb equivalent', async () => {
    const instanceId = await createStationWorkout(['ex_sled_push'])
    await renderWorkout(instanceId)

    expect(await screen.findByText(/Reference: 50 m · 152 kg · ~335 lb/)).toBeInTheDocument()
  })

  it('renders sled-specific fields and the friction caveat for sled stations', async () => {
    const instanceId = await createStationWorkout(['ex_sled_push'])
    await renderWorkout(instanceId)

    expect(await screen.findByLabelText(/total loaded weight/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/sled weight/i)).toBeInTheDocument()
    expect(screen.getByText('Surface')).toBeInTheDocument()
    expect(screen.getByText(/friction/i)).toBeInTheDocument()
  })

  it('offers sled floor surfaces (turf/rubber/concrete/other), never the run surfaces, for both sled stations', async () => {
    const instanceId = await createStationWorkout(['ex_sled_push', 'ex_sled_pull'])
    await renderWorkout(instanceId)
    await screen.findByText('Sled push')

    for (const label of ['Turf', 'Rubber / gym floor', 'Concrete', 'Other']) {
      expect(screen.getAllByText(label)).toHaveLength(2) // one per sled station
    }
    // Sled friction is a floor property, not a running surface -- these two
    // values are meaningless for a sled and must never appear as options here.
    expect(screen.queryByText('Treadmill')).toBeNull()
    expect(screen.queryByText('Track')).toBeNull()
  })

  it('saves the chosen sled floor surface onto the StationLog', async () => {
    const instanceId = await createStationWorkout(['ex_sled_push'])
    await renderWorkout(instanceId)
    await screen.findByText('Sled push')

    fireEvent.click(screen.getByText('Concrete'))

    await waitFor(async () => {
      const logs = await db.stationLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs).toHaveLength(1)
      expect(logs[0]?.surface).toBe('concrete')
    })
  })

  it('does not render a Surface control for a non-sled station', async () => {
    const instanceId = await createStationWorkout(['ex_row'])
    await renderWorkout(instanceId)
    await screen.findByText('Row')

    expect(screen.queryByText('Surface')).toBeNull()
  })

  it('defaults wall balls to 100 reps, 6 kg, and shows the 3.0 m target with the overhead-clearance note', async () => {
    const instanceId = await createStationWorkout(['ex_wall_ball'])
    await renderWorkout(instanceId)

    await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>(/^reps/i).value).toBe('100') })
    expect(screen.getByLabelText<HTMLInputElement>(/^load/i).value).toBe('6')
    expect(screen.getByText(/3 m target/)).toBeInTheDocument()
    expect(document.querySelector('.station-block__note')?.textContent).toMatch(/overhead clearance/i)
  })

  it('editing a HYROX standard changes the reference shown, proving standards are configuration not a literal', async () => {
    const instanceId = await createStationWorkout(['ex_sled_push'])
    await renderWorkout(instanceId)
    expect(await screen.findByText(/Reference: 50 m · 152 kg · ~335 lb/)).toBeInTheDocument()

    await updateStandard('std_sled_push', { loadKg: 175 })

    await waitFor(() => { expect(screen.getByText(/Reference: 50 m · 175 kg · ~386 lb/)).toBeInTheDocument() })
  })

  it('saves a StationLog with the entered values and the chosen unit', async () => {
    const instanceId = await createStationWorkout(['ex_row'])
    await renderWorkout(instanceId)

    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText(/^time/i), { target: { value: '240' } })
    fireEvent.change(screen.getByLabelText(/rpe/i), { target: { value: '7' } })
    fireEvent.blur(screen.getByLabelText(/rpe/i))

    await waitFor(async () => {
      const logs = await db.stationLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs).toHaveLength(1)
      expect(logs[0]?.station).toBe('row')
      expect(logs[0]?.distanceM).toBe(1000)
      expect(logs[0]?.timeSec).toBe(240)
      expect(logs[0]?.rpe).toBe(7)
    })
  })

  it('a station with no load entered still saves distance and time', async () => {
    const instanceId = await createStationWorkout(['ex_ski_erg'])
    await renderWorkout(instanceId)

    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText(/^time/i), { target: { value: '210' } })
    fireEvent.blur(screen.getByLabelText(/^time/i))

    await waitFor(async () => {
      const logs = await db.stationLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs).toHaveLength(1)
      expect(logs[0]?.distanceM).toBe(1000)
      expect(logs[0]?.timeSec).toBe(210)
      expect(logs[0]?.load).toBeUndefined()
    })
  })
})
