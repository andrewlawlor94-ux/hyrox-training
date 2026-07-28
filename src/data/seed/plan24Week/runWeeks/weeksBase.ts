import { buildEasyRunTemplate, buildIntervalQualityTemplate, buildLongRunTemplate } from './runBuilders'
import type { WeekRunEntry } from './types'

/** Weeks 1-6 (Base phase), pinned exactly per §19: this is literal data (the
 * brief gives all eighteen numbers explicitly), not something to derive --
 * only the *assembly* into templates below is code. Week 4 is the deload:
 * easy run and long run both drop relative to week 3. */
const EASY_RUN_MINUTES: readonly number[] = [30, 35, 35, 30, 40, 40]
const LONG_RUN_MINUTES: readonly number[] = [40, 45, 50, 40, 55, 60]
/** [reps, workSec] per week -- weeks 1-4 are short intervals, 5-6 are tempo reps. */
const QUALITY_SPEC: readonly { reps: number; workSec: number; recoverySec: number }[] = [
  { reps: 6, workSec: 120, recoverySec: 90 },
  { reps: 7, workSec: 120, recoverySec: 90 },
  { reps: 5, workSec: 180, recoverySec: 120 },
  { reps: 6, workSec: 60, recoverySec: 60 },
  { reps: 4, workSec: 300, recoverySec: 90 },
  { reps: 5, workSec: 240, recoverySec: 90 },
]

function easyIndex(weekNumber: number): number {
  return weekNumber - 1
}

export function buildBaseWeekRunEntries(): Record<number, WeekRunEntry> {
  const entries: Record<number, WeekRunEntry> = {}
  for (let weekNumber = 1; weekNumber <= 6; weekNumber += 1) {
    const i = easyIndex(weekNumber)
    const easyMinutes = EASY_RUN_MINUTES[i]
    const longMinutes = LONG_RUN_MINUTES[i]
    const quality = QUALITY_SPEC[i]
    if (easyMinutes === undefined || longMinutes === undefined || quality === undefined) {
      throw new Error(`Missing base-week run spec for week ${String(weekNumber)}`)
    }
    const isTempo = weekNumber >= 5
    // `sequenceInWeek`/`priority` here are placeholders: weeks.ts overrides
    // both when it assembles the final week, since only weeks.ts knows the
    // week's actual slot layout and this phase's essential/important split.
    entries[weekNumber] = {
      easy: buildEasyRunTemplate(easyMinutes, 0, 'essential'),
      quality: buildIntervalQualityTemplate(quality.reps, quality.recoverySec, 0, 'essential', {
        workSec: quality.workSec,
        name: isTempo ? 'Quality run (tempo)' : 'Quality run (intervals)',
      }),
      slotSix: buildLongRunTemplate(longMinutes, 0, 'important'),
      zone2Minutes: 0, // overwritten by the shared zone2 ramp in runProgression.ts
    }
  }
  return entries
}
