import { buildContinuousRunTemplate, buildEasyRunTemplate, buildIntervalQualityTemplate } from './runBuilders'
import { buildCompromisedQualityTemplate, buildHybridTemplate } from './hybridTemplates'
import type { WeekRunEntry } from './types'

/** Easy-run minutes for weeks 13-18: the brief pins no explicit figures here
 * (only weeks 1-6 and 23-24 are pinned), so this holds at the Build phase's
 * plateau (40 min) and dips on the consolidation week and the week of the
 * big simulation, when slot 2 isn't scheduled at all (see weeks.ts). */
const EASY_MINUTES: Record<number, number> = { 13: 40, 14: 40, 15: 40, 16: 35, 17: 40, 18: 35 }

/**
 * Weeks 13-18 (Race-specific phase), per §19/§8: station volume climbs
 * 50/60/70/(40 dip)/75/75%, culminating in the week 18 full-format
 * simulation -- the near-full rehearsal, about six weeks from race day (D4).
 * Week 16 is the consolidation dip: reduced *volume* (4 rounds vs. 6-7 in the
 * surrounding weeks), 5 sessions instead of 6 -- but still genuine station
 * content at 40%, not a plain long run carrying a meaningless percentage
 * (controller-corrected: a `stationVolumePct` field must never appear on a
 * template with no station prescriptions).
 */
export function buildRaceSpecificWeekRunEntries(): Record<number, WeekRunEntry> {
  const entries: Record<number, WeekRunEntry> = {}

  entries[13] = {
    easy: buildEasyRunTemplate(EASY_MINUTES[13] ?? 40, 0, 'important'),
    quality: buildIntervalQualityTemplate(6, 90, 0, 'essential', { workDistanceM: 1000, paceSource: 'goalRacePace', name: 'Quality run (1 km @ goal pace)' }),
    slotSix: buildHybridTemplate(5, 5, 0, 'essential', { stationVolumePct: 50, name: 'Hybrid: 5 rounds (1 km + station)' }),
    zone2Minutes: 0,
  }

  entries[14] = {
    easy: buildEasyRunTemplate(EASY_MINUTES[14] ?? 40, 0, 'important'),
    quality: buildCompromisedQualityTemplate(5, 'sledPush', 0, 'essential', { stationVolumePct: 60 }),
    slotSix: buildHybridTemplate(6, 6, 0, 'essential', { stationVolumePct: 60, name: 'Hybrid: 6 rounds (1 km + station)' }),
    zone2Minutes: 0,
  }

  entries[15] = {
    easy: buildEasyRunTemplate(EASY_MINUTES[15] ?? 40, 0, 'important'),
    quality: buildIntervalQualityTemplate(7, 90, 0, 'essential', {
      workDistanceM: 1000, paceSource: 'goalRacePace', name: 'Quality run (1 km @ goal pace)',
      notes: 'Race-load sled exposure this week -- no failure attempts.',
    }),
    slotSix: buildHybridTemplate(6, 6, 0, 'essential', { stationVolumePct: 70, name: 'Hybrid: 6 rounds (1 km + station)' }),
    zone2Minutes: 0,
  }

  entries[16] = {
    easy: buildEasyRunTemplate(EASY_MINUTES[16] ?? 35, 0, 'important'),
    quality: buildIntervalQualityTemplate(4, 90, 0, 'essential', { workDistanceM: 1000, name: 'Quality run (1 km reps)' }),
    slotSix: buildHybridTemplate(4, 4, 0, 'essential', {
      stationVolumePct: 40,
      name: 'Hybrid: 4 rounds (1 km + station), consolidation',
      notes: 'Consolidation week: reduced hybrid volume (4 rounds, 40% station volume) rather than a full circuit, easing into the final race-specific push.',
    }),
    zone2Minutes: 0,
  }

  entries[17] = {
    easy: buildEasyRunTemplate(EASY_MINUTES[17] ?? 40, 0, 'important'),
    quality: buildCompromisedQualityTemplate(6, 'wallBalls', 0, 'essential', { stationVolumePct: 75, notes: 'Wall-ball technique under fatigue.' }),
    slotSix: buildHybridTemplate(7, 7, 0, 'essential', { stationVolumePct: 75, name: 'Hybrid: 7 rounds (1 km + station)' }),
    zone2Minutes: 0,
  }

  entries[18] = {
    easy: buildEasyRunTemplate(EASY_MINUTES[18] ?? 35, 0, 'important'),
    quality: buildContinuousRunTemplate(25, 0, 'essential', {
      sessionSlot: 4, name: 'Easy-effort technique run', recoveryTags: ['hardRun'],
      notes: 'Easy quality only -- priming, not hard, ahead of this week’s simulation.',
    }),
    slotSix: buildHybridTemplate(8, 8, 0, 'essential', {
      kind: 'simulation',
      stationVolumePct: 75,
      runPaceSource: 'goalRacePace',
      name: 'Full-format simulation (75%)',
      notes: 'The near-full rehearsal, about six weeks from race day.',
    }),
    zone2Minutes: 0,
  }

  return entries
}
