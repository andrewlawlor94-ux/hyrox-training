import type { Priority, RecoveryTag } from '@/domain/types'
import type { QueueTemplate } from '@/domain/queue/recompute'
import { BASE_EASY_RUN_MINUTES, BASE_ZONE2_MINUTES } from './constants'

/** Base weeks carry a fixed strength-maintenance duration rather than a ramp:
 * the point of a Base week's lifting is to *protect* the athlete's existing
 * strength base while running volume builds, not to progressively overload it. */
const BASE_STRENGTH_MAINTENANCE_MINUTES = 45
/** Fixed duration for the week's single long easy run. Unlike the midweek
 * easy run and Zone 2 session, the brief specifies no ramp array for this
 * session, so it stays constant across the base block. */
const BASE_LONG_RUN_MINUTES = 50

export interface BaseWeekTemplate extends QueueTemplate {
  estMinutes: number
}

export interface BaseWeek {
  weekNumber: number
  label: string
  isDeload: boolean
  templates: BaseWeekTemplate[]
}

interface BaseSessionSpec {
  name: string
  priority: Priority
  recoveryTags: RecoveryTag[]
  estMinutes: (weekIndex: number) => number
}

/** Reads a ramp table by week index (zero-based), clamping to the highest
 * defined index once the base block runs longer than the table — so a
 * longer Base block keeps using the final, most-progressed duration rather
 * than reading past the end. */
function rampValue(ramp: Record<number, number>, weekIndex: number): number {
  const maxIndex = Math.max(...Object.keys(ramp).map(Number))
  const clampedIndex = Math.min(weekIndex, maxIndex)
  return ramp[clampedIndex] ?? 0
}

/**
 * Five sessions per Base week (§19, D1): the athlete has a strong lifting
 * base but very low running volume, so a Base week protects the lift while
 * building aerobic durability. No `hardRun` anywhere — Base weeks are
 * deliberately easy-effort only.
 */
const BASE_SESSION_SPECS: BaseSessionSpec[] = [
  {
    name: 'Strength A maintenance',
    priority: 'essential',
    recoveryTags: ['lowerBodyStrength'],
    estMinutes: () => BASE_STRENGTH_MAINTENANCE_MINUTES,
  },
  {
    name: 'Easy run + durability',
    priority: 'essential',
    recoveryTags: ['easyRun'],
    estMinutes: (weekIndex) => rampValue(BASE_EASY_RUN_MINUTES, weekIndex),
  },
  {
    name: 'Zone 2',
    priority: 'optional',
    recoveryTags: ['lowImpactAerobic'],
    estMinutes: (weekIndex) => rampValue(BASE_ZONE2_MINUTES, weekIndex),
  },
  {
    name: 'Strength B maintenance',
    priority: 'essential',
    recoveryTags: ['upperBodyStrength'],
    estMinutes: () => BASE_STRENGTH_MAINTENANCE_MINUTES,
  },
  {
    name: 'Long easy run',
    priority: 'important',
    recoveryTags: ['longRun'],
    estMinutes: () => BASE_LONG_RUN_MINUTES,
  },
]

/**
 * Generates `count` editable prologue "Base" weeks (§19, D1), numbered from
 * one. Pure and deterministic: identical `count` always produces identical
 * output. Template ids are `base_w{weekNumber}_s{sessionSlot}`, unique across
 * the whole generated block.
 */
export function generateBaseWeeks(count: number): BaseWeek[] {
  return Array.from({ length: count }, (_, weekIndex) => {
    const weekNumber = weekIndex + 1
    const templates: BaseWeekTemplate[] = BASE_SESSION_SPECS.map((spec, slotIndex) => {
      const sessionSlot = slotIndex + 1
      return {
        templateId: `base_w${String(weekNumber)}_s${String(sessionSlot)}`,
        weekNumber,
        sessionSlot,
        sequenceInWeek: slotIndex,
        priority: spec.priority,
        recoveryTags: [...spec.recoveryTags],
        name: spec.name,
        estMinutes: spec.estMinutes(weekIndex),
      }
    })
    return { weekNumber, label: `Base week ${String(weekNumber)}`, isDeload: false, templates }
  })
}
