import type { HyroxStandard } from '@/data/types'

/**
 * HYROX Men's Open competition standards, seeded in race order (§13). These
 * are editable configuration, not frozen constants -- competition standards
 * change between seasons, so every row carries a stable `id` the athlete can
 * edit in place; `isSeeded` lets a "restore defaults" action recognize which
 * rows came from this seed versus a from-scratch user entry.
 *
 * Two rows carry mandatory context in `notes`:
 * - Wall balls: the overhead clearance the target requires is a genuine
 *   safety concern when throwing indoors.
 * - Sled push: floor/turf friction varies by venue, so a slower time at a
 *   different gym is not necessarily lost fitness.
 */
export const SEED_HYROX_STANDARDS = [
  {
    id: 'std_ski_erg',
    station: 'skiErg',
    order: 1,
    distanceM: 1000,
    notes: 'Damper and drag factor vary by machine; match effort, not the display number, across venues.',
    isSeeded: true,
  },
  {
    id: 'std_sled_push',
    station: 'sledPush',
    order: 2,
    distanceM: 50,
    loadKg: 152,
    notes: 'Sled friction varies between venues (turf, rubber, and sled condition all change resistance), so cross-venue push times are not a like-for-like comparison.',
    isSeeded: true,
  },
  {
    id: 'std_sled_pull',
    station: 'sledPull',
    order: 3,
    distanceM: 50,
    loadKg: 103,
    notes: 'Rope length and pull technique affect time as much as raw strength; friction also varies between venues.',
    isSeeded: true,
  },
  {
    id: 'std_burpee_broad_jump',
    station: 'burpeeBroadJump',
    order: 4,
    distanceM: 80,
    notes: 'Judged on full chest-to-floor and both feet clearing the jump line; no-reps add distance, not just time.',
    isSeeded: true,
  },
  {
    id: 'std_row',
    station: 'row',
    order: 5,
    distanceM: 1000,
    notes: 'Damper and drag factor vary by machine; match effort, not the display number, across venues.',
    isSeeded: true,
  },
  {
    id: 'std_farmer_carry',
    station: 'farmerCarry',
    order: 6,
    distanceM: 200,
    loadPerHandKg: 24,
    notes: 'Grip fatigue from prior stations is the usual limiter, not the carry itself.',
    isSeeded: true,
  },
  {
    id: 'std_sandbag_lunge',
    station: 'sandbagLunge',
    order: 7,
    distanceM: 100,
    loadKg: 20,
    notes: 'Sandbag carried across the shoulders; alternate lead leg to manage fatigue.',
    isSeeded: true,
  },
  {
    id: 'std_wall_balls',
    station: 'wallBalls',
    order: 8,
    reps: 100,
    ballKg: 6,
    targetHeightM: 3.0,
    notes: 'Confirm overhead clearance at the target before starting -- throwing a 6 kg ball to a 3.0 m mark needs real headroom, especially indoors.',
    isSeeded: true,
  },
] as const satisfies readonly HyroxStandard[]
