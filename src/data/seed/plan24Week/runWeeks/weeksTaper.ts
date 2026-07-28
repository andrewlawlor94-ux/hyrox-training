import type { Priority } from '@/data/types'
import { positiveRestSec } from '../stationCircuits'
import { targetRirFor } from '../strengthTemplates'
import type { SeedTemplate } from '../types'
import { buildEasyRunTemplate, buildIntervalQualityTemplate } from './runBuilders'
import { buildHybridTemplate } from './hybridTemplates'
import type { WeekRunEntry } from './types'

const RACE_DAY_CHECKLIST =
  'Race-day checklist: shoes/socks broken in · nutrition and hydration for the morning planned · ' +
  'warm-up mobility done 60-90 min before the start · gear bag packed (spare layer, tape, chalk) · ' +
  'arrive early for the warm-up area · know your heat time and corral.'

/**
 * Weeks 23-24 (Taper phase), per §19: W23 runs at roughly 60-70% of peak
 * (no exhausting simulation), W24 at roughly 35-45% through race day itself.
 */
export function buildTaperWeekRunEntries(): Record<number, WeekRunEntry> {
  const entries: Record<number, WeekRunEntry> = {}

  entries[23] = {
    easy: buildEasyRunTemplate(35, 0, 'essential'),
    quality: buildIntervalQualityTemplate(4, 90, 0, 'essential', {
      workDistanceM: 1000, paceSource: 'goalRacePace', name: 'Quality run (1 km race pace)',
    }),
    slotSix: buildHybridTemplate(2, 3, 0, 'important', {
      stationVolumePct: 25,
      name: 'Light station technique',
      notes: 'Technique-focused touches only -- no exhausting simulation this week.',
    }),
    zone2Minutes: 35, // pinned by the brief, overriding the 40->50 ramp
  }

  entries[24] = {
    easy: buildEasyRunTemplate(25, 0, 'essential'),
    quality: buildIntervalQualityTemplate(3, 60, 0, 'essential', {
      workDistanceM: 600, paceSource: 'goalRacePace', name: 'Race-pace reminders (600m)',
    }),
    slotSix: buildRaceTemplate(0, 'essential'),
    zone2Minutes: 0, // unused: week 24 has no Zone 2 session
  }

  return entries
}

/** Slot 6, week 24: race day itself. */
function buildRaceTemplate(sequenceInWeek: number, priority: Priority): SeedTemplate {
  return {
    sessionSlot: 6,
    sequenceInWeek,
    name: 'Race day',
    kind: 'race',
    priority,
    recoveryTags: ['raceSimulation'],
    estMinutes: 90,
    notes: RACE_DAY_CHECKLIST,
    prescriptions: [
      {
        exerciseId: 'ex_compromised_run',
        order: 0,
        restSec: positiveRestSec('ex_compromised_run', 60),
        intervalSpec: { reps: 8, workDistanceM: 1000, recoverySec: 90 },
        paceSource: 'goalRacePace',
        notes: 'This is race day.',
      },
    ],
  }
}

/** Slot 1, week 24: "light technique/mobility" in place of a full Strength A
 * session -- the brief calls for light technique the week of the race, not
 * a normal lifting session. */
export function buildRaceWeekTechniqueTemplate(sequenceInWeek: number, priority: Priority): SeedTemplate {
  return {
    sessionSlot: 1,
    sequenceInWeek,
    name: 'Race-week technique & mobility',
    kind: 'strength',
    priority,
    recoveryTags: ['lowerBodyStrength'],
    estMinutes: 20,
    notes: 'Light technique and mobility only -- not a training stimulus this close to race day.',
    prescriptions: [
      // This template is only ever built for week 24 (see `buildTemplateForSlot`
      // in `weeks.ts`) -- the literal week number below is `targetRirFor`'s
      // Taper-phase RIR, not a stand-in for "whatever week this is".
      { exerciseId: 'ex_split_squat', order: 0, sets: 2, repMin: 8, repMax: 8, restSec: positiveRestSec('ex_split_squat', 90), targetRir: targetRirFor(24, false) },
      { exerciseId: 'ex_pallof_press', order: 1, sets: 2, repMin: 10, repMax: 10, restSec: positiveRestSec('ex_pallof_press', 45), targetRir: targetRirFor(24, false) },
    ],
  }
}
