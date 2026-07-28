import { buildEasyRunTemplate, buildIntervalQualityTemplate } from './runBuilders'
import { buildCompromisedQualityTemplate, buildHybridTemplate } from './hybridTemplates'
import { buildStationPrescription } from '../stationCircuits'
import type { WeekRunEntry } from './types'

const EASY_MINUTES: Record<number, number> = { 19: 40, 20: 40, 21: 35, 22: 35 }

/**
 * Weeks 19-22 (Specific prep phase), per §19/§8: peak specificity. Station
 * volume holds at 80% through weeks 19-20, the week 21 controlled
 * full-format rehearsal runs at 100%, and week 22 steps back down to 60% as
 * a reduced-volume consolidation heading into the taper. Weeks 19, 20 and 22
 * deliberately carry no simulation -- full simulations are never weekly.
 */
export function buildSpecificPrepWeekRunEntries(): Record<number, WeekRunEntry> {
  const entries: Record<number, WeekRunEntry> = {}

  entries[19] = {
    easy: buildEasyRunTemplate(EASY_MINUTES[19] ?? 40, 0, 'important'),
    quality: buildIntervalQualityTemplate(8, 90, 0, 'essential', {
      workDistanceM: 1000, paceSource: 'goalRacePace', name: 'Quality run (1 km @ goal pace)',
      notes: 'Transitions practice: move from the run straight into the next station without settling first.',
    }),
    slotSix: buildHybridTemplate(7, 7, 0, 'essential', { stationVolumePct: 80, name: 'Hybrid: 7 rounds (1 km + station)' }),
    zone2Minutes: 0,
  }

  entries[20] = {
    easy: buildEasyRunTemplate(EASY_MINUTES[20] ?? 40, 0, 'important'),
    quality: buildCompromisedQualityTemplate(6, 'sledPull', 0, 'essential', { stationVolumePct: 80 }),
    slotSix: buildHybridTemplate(7, 7, 0, 'essential', {
      stationVolumePct: 80,
      name: 'Hybrid: 7 rounds + wall-ball fatigue block',
      notes: 'No simulation this week -- a wall-ball fatigue block finishes the circuit.',
      extra: [buildStationPrescription('wallBalls', 80, 8)],
    }),
    zone2Minutes: 0,
  }

  entries[21] = {
    easy: buildEasyRunTemplate(EASY_MINUTES[21] ?? 35, 0, 'important'),
    quality: buildIntervalQualityTemplate(3, 60, 0, 'essential', {
      workDistanceM: 400, paceSource: 'goalRacePace', name: 'Race-pace reminders',
    }),
    slotSix: buildHybridTemplate(8, 8, 0, 'essential', {
      kind: 'simulation',
      stationVolumePct: 100,
      runPaceSource: 'goalRacePace',
      name: 'Full-format rehearsal (controlled)',
      notes: 'Controlled full-format rehearsal at 100% station volume -- executed under control, not an all-out race effort.',
    }),
    zone2Minutes: 0,
  }

  entries[22] = {
    easy: buildEasyRunTemplate(EASY_MINUTES[22] ?? 35, 0, 'important'),
    quality: buildIntervalQualityTemplate(5, 90, 0, 'essential', { workDistanceM: 1000, paceSource: 'goalRacePace', name: 'Quality run (1 km @ goal pace)' }),
    slotSix: buildHybridTemplate(4, 4, 0, 'essential', {
      stationVolumePct: 60,
      name: 'Hybrid: transitions + wall-ball fatigue',
      notes: 'Reduced heavy strength this week; intensity is preserved, not volume.',
      extra: [buildStationPrescription('wallBalls', 60, 5)],
    }),
    zone2Minutes: 0,
  }

  return entries
}
