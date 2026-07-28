import { buildContinuousRunTemplate, buildEasyRunTemplate, buildIntervalQualityTemplate, buildLongRunTemplate } from './runBuilders'
import { buildHybridTemplate } from './hybridTemplates'
import type { WeekRunEntry } from './types'

/**
 * Weeks 7-12 (Build phase), per §19: progressive running and hybrid volume,
 * ending in the week 12 benchmark (a standalone 5 km test plus a half
 * simulation of 4x1km at ~50% station volume). Week 8 is the deload.
 *
 * Weeks 7/9/11's hybrid station volume (30/40/50%) is this implementation's
 * own gentle ramp into week 13's explicit 50% baseline -- the brief pins no
 * percentage pre-week-13, only round counts, so a smooth build-up avoids
 * jumping straight to full race-standard station distances in Build.
 */
export function buildBuildWeekRunEntries(): Record<number, WeekRunEntry> {
  const entries: Record<number, WeekRunEntry> = {}
  // `sequenceInWeek`/`priority` passed below are placeholders -- weeks.ts
  // overrides both when it assembles the final week (see weeksBase.ts).

  entries[7] = {
    easy: buildEasyRunTemplate(40, 0, 'important'),
    quality: buildIntervalQualityTemplate(5, 90, 0, 'essential', { workDistanceM: 800, name: 'Quality run (800m reps)' }),
    slotSix: buildHybridTemplate(4, 4, 0, 'essential', { stationVolumePct: 30, name: 'Hybrid: 4 rounds (1 km + station)' }),
    zone2Minutes: 0,
  }

  entries[8] = {
    // Deload: easy run and long run both drop; the quality slot becomes a single continuous tempo effort.
    easy: buildEasyRunTemplate(35, 0, 'important'),
    quality: buildContinuousRunTemplate(20, 0, 'essential', { sessionSlot: 4, name: 'Tempo run', recoveryTags: ['hardRun'] }),
    slotSix: buildLongRunTemplate(50, 0, 'essential', { notes: 'Deload week: volume drops, execution stays clean.' }),
    zone2Minutes: 0,
  }

  entries[9] = {
    easy: buildEasyRunTemplate(45, 0, 'important'),
    quality: buildIntervalQualityTemplate(5, 90, 0, 'essential', { workDistanceM: 1000, name: 'Quality run (1 km reps)' }),
    slotSix: buildHybridTemplate(5, 5, 0, 'essential', { stationVolumePct: 40, name: 'Hybrid: 5 rounds (1 km + station)' }),
    zone2Minutes: 0,
  }

  entries[10] = {
    easy: buildEasyRunTemplate(45, 0, 'important'),
    quality: buildIntervalQualityTemplate(3, 120, 0, 'essential', { workSec: 480, name: 'Threshold run (8 min reps)' }),
    slotSix: buildLongRunTemplate(62, 0, 'essential', { notes: 'Long run, 60-65 minutes.' }),
    zone2Minutes: 0,
  }

  entries[11] = {
    easy: buildEasyRunTemplate(45, 0, 'important'),
    quality: buildIntervalQualityTemplate(6, 90, 0, 'essential', { workDistanceM: 1000, name: 'Quality run (1 km reps)' }),
    slotSix: buildHybridTemplate(5, 5, 0, 'essential', { stationVolumePct: 50, name: 'Hybrid: 5 rounds, more station volume' }),
    zone2Minutes: 0,
  }

  // Week 12 (benchmark): only slot 2 (easy recovery run), slot 4 (repurposed
  // as the standalone 5 km test), slot 1 (Strength A), and slot 6 (half
  // simulation) run this week -- see weeks.ts for the week-level composition.
  entries[12] = {
    easy: buildEasyRunTemplate(25, 0, 'essential'),
    quality: buildContinuousRunTemplate(24, 0, 'essential', {
      sessionSlot: 4,
      name: '5 km benchmark test',
      recoveryTags: ['hardRun'],
      distanceM: 5000,
      notes: 'Standalone 5 km time test -- run it hard and time it; this is a benchmark, not a paced prescription.',
    }),
    slotSix: buildHybridTemplate(4, 8, 0, 'essential', {
      kind: 'simulation',
      stationVolumePct: 50,
      runPaceSource: 'goalRacePace',
      name: 'Half-HYROX simulation',
      notes: 'Half simulation: 4 x 1 km at goal race pace with all eight stations at half volume.',
    }),
    zone2Minutes: 0,
  }

  return entries
}
