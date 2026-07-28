import type { SeedTemplate } from '../types'

/** One week's running content: the easy run (slot 2), the quality run
 * (slot 4), the slot-6 session (long run / hybrid / simulation / benchmark
 * / race), and the Zone 2 duration (the slot-3 template itself is built
 * separately since it doesn't vary in shape, only duration and exercise). */
export interface WeekRunEntry {
  easy: SeedTemplate
  quality: SeedTemplate
  slotSix: SeedTemplate
  zone2Minutes: number
}
