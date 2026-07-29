import { describe, expect, it } from 'vitest'
import type { Exercise, InstancePrescription, WorkoutInstance } from '@/data/types'
import { buildWeeklyVolume } from '../runningViewModel'

const NOW = '2026-01-05T08:00:00.000Z'

const EASY_RUN_EXERCISE: Exercise = {
  id: 'ex_easy_run', name: 'Easy run', category: 'run', measurementType: 'duration', loadStyle: 'bodyWeight',
  defaultUnit: 'lb', defaultRestSec: 0, progressionIncrement: 0, incrementUnit: 'lb',
  techniqueNotes: '', isArchived: false, isSeeded: true, createdAt: NOW, updatedAt: NOW,
}

const QUALITY_RUN_EXERCISE: Exercise = {
  id: 'ex_quality_run', name: 'Quality run', category: 'run', measurementType: 'pace', loadStyle: 'bodyWeight',
  defaultUnit: 'lb', defaultRestSec: 0, progressionIncrement: 0, incrementUnit: 'lb',
  techniqueNotes: '', isArchived: false, isSeeded: true, createdAt: NOW, updatedAt: NOW,
}

function baseInstance(id: string, weekNumber: number): WorkoutInstance {
  return {
    id, planId: 'plan_1', templateId: `tmpl_${id}`, weekNumber, sessionSlot: 2,
    plannedDate: '2026-01-05', scheduledDate: '2026-01-05', sequence: 0, priority: 'essential',
    recoveryTags: [], status: 'available', isManualOverride: false, frozen: false,
  }
}

describe('buildWeeklyVolume — duration-prescribed sessions (Follow-up 2)', () => {
  it('reports a non-zero planned duration for a week whose only run prescription carries a durationSec and no distance at all', () => {
    // Mirrors the real seeded plan's week 1: an easy run prescribed as
    // "30 minutes", never a distance. `plannedKm` staying 0 here is honest
    // (no distance was ever prescribed) -- the bug this follow-up fixes is
    // that 0 was the *only* planned figure shown, silently discarding the
    // 30 minutes the plan actually asked for.
    const instances = [baseInstance('wi_1', 1)]
    const prescriptionsByInstanceId = new Map<string, InstancePrescription[]>([
      ['wi_1', [
        { id: 'ip_1', instanceId: 'wi_1', templateId: 'tmpl_wi_1', exerciseId: 'ex_easy_run', order: 0, restSec: 60, durationSec: 1800 },
      ]],
    ])
    const exercisesById = new Map([['ex_easy_run', EASY_RUN_EXERCISE]])

    const rows = buildWeeklyVolume(instances, prescriptionsByInstanceId, exercisesById, [], 1)

    expect(rows).toHaveLength(1)
    const week1 = rows.find((r) => r.weekNumber === 1)
    if (!week1) throw new Error('expected a week-1 row')
    expect(week1.plannedKm).toBe(0)
    expect(week1.plannedDurationSec).toBe(1800)
  })

  it('sums planned duration across every duration-prescribed run in the week, alongside any genuinely distance-prescribed one', () => {
    // A mixed week: one duration-prescribed easy run (25 min) plus one
    // genuinely distance-prescribed quality run (5 km) -- the row must
    // carry both honestly, in their own units, never converting one into
    // the other.
    const instances = [baseInstance('wi_1', 3), baseInstance('wi_2', 3)]
    const prescriptionsByInstanceId = new Map<string, InstancePrescription[]>([
      ['wi_1', [
        { id: 'ip_1', instanceId: 'wi_1', templateId: 'tmpl_wi_1', exerciseId: 'ex_easy_run', order: 0, restSec: 60, durationSec: 1500 },
      ]],
      ['wi_2', [
        { id: 'ip_2', instanceId: 'wi_2', templateId: 'tmpl_wi_2', exerciseId: 'ex_quality_run', order: 0, restSec: 90, distanceM: 5000 },
      ]],
    ])
    const exercisesById = new Map([
      ['ex_easy_run', EASY_RUN_EXERCISE],
      ['ex_quality_run', QUALITY_RUN_EXERCISE],
    ])

    const rows = buildWeeklyVolume(instances, prescriptionsByInstanceId, exercisesById, [], 3)

    const week3 = rows.find((r) => r.weekNumber === 3)
    if (!week3) throw new Error('expected a week-3 row')
    expect(week3.plannedDurationSec).toBe(1500)
    expect(week3.plannedKm).toBe(5)
  })

  it('never fabricates a planned duration for a purely distance-prescribed session', () => {
    const instances = [baseInstance('wi_1', 12)]
    const prescriptionsByInstanceId = new Map<string, InstancePrescription[]>([
      ['wi_1', [
        { id: 'ip_1', instanceId: 'wi_1', templateId: 'tmpl_wi_1', exerciseId: 'ex_quality_run', order: 0, restSec: 90, distanceM: 5000 },
      ]],
    ])
    const exercisesById = new Map([['ex_quality_run', QUALITY_RUN_EXERCISE]])

    const rows = buildWeeklyVolume(instances, prescriptionsByInstanceId, exercisesById, [], 12)

    const week12 = rows.find((r) => r.weekNumber === 12)
    if (!week12) throw new Error('expected a week-12 row')
    expect(week12.plannedDurationSec).toBe(0)
    expect(week12.plannedKm).toBe(5)
  })
})
