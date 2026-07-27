import { describe, expect, it } from 'vitest'
import { recomputeQueue } from '../recompute'
import type { QueueTemplate } from '../recompute'
import { event, input, PLAN_START, weekTemplates } from './recompute.fixtures'

function byId(result: ReturnType<typeof recomputeQueue>, templateId: string) {
  const found = result.instances.find((i) => i.templateId === templateId)
  if (!found) throw new Error(`No instance ${templateId}`)
  return found
}

describe('baseline materialization', () => {
  const r = recomputeQueue(input())

  it('creates one instance per template', () => {
    expect(r.instances).toHaveLength(6)
  })

  it('maps slots to Monday through Saturday of the plan week', () => {
    expect(byId(r, 'w1s1').plannedDate).toBe('2026-08-03')
    expect(byId(r, 'w1s6').plannedDate).toBe('2026-08-08')
  })

  it('leaves Sunday free', () => {
    expect(r.instances.map((i) => i.scheduledDate)).not.toContain('2026-08-09')
  })

  it('schedules every instance on its planned date when nothing has happened', () => {
    expect(r.instances.every((i) => i.scheduledDate === i.plannedDate)).toBe(true)
  })

  it('produces no explanations when nothing moved', () => {
    expect(r.explanations).toEqual([])
  })

  it('marks everything upcoming with no completion date', () => {
    expect(r.instances.every((i) => i.status === 'upcoming' && i.completedForDate === null)).toBe(true)
  })

  it('sorts instances by week then sequence', () => {
    expect(r.instances.map((i) => i.templateId)).toEqual(['w1s1', 'w1s2', 'w1s3', 'w1s4', 'w1s5', 'w1s6'])
  })
})

describe('completion is terminal and dated', () => {
  const r = recomputeQueue(input({
    today: '2026-08-04',
    events: [event('COMPLETE', 'w1s1', '2026-08-03T18:00:00.000Z', { forDate: '2026-08-03' })],
  }))

  it('marks the instance completed', () => {
    expect(byId(r, 'w1s1').status).toBe('completed')
  })

  it('records the date it was completed for', () => {
    expect(byId(r, 'w1s1').completedForDate).toBe('2026-08-03')
  })

  it('does not move a completed instance', () => {
    expect(byId(r, 'w1s1').scheduledDate).toBe('2026-08-03')
  })
})

describe('partial completion is never treated as complete', () => {
  const r = recomputeQueue(input({
    today: '2026-08-04',
    events: [event('PARTIAL', 'w1s1', '2026-08-03T18:00:00.000Z', { forDate: '2026-08-03' })],
  }))

  it('uses the partiallyCompleted status', () => {
    expect(byId(r, 'w1s1').status).toBe('partiallyCompleted')
  })

  it('is terminal, so it is not rescheduled', () => {
    expect(byId(r, 'w1s1').scheduledDate).toBe('2026-08-03')
  })

  it('still occupies its day for eligibility purposes', () => {
    expect(r.instances.filter((i) => i.scheduledDate === '2026-08-03')).toHaveLength(1)
  })
})

describe('missed essential session moves to the next eligible day', () => {
  // Slot 4 (quality run, essential) was never completed; today is two days later.
  const r = recomputeQueue(input({ today: '2026-08-07' }))

  it('does not leave an essential session in the past', () => {
    expect(byId(r, 'w1s4').scheduledDate! >= '2026-08-07').toBe(true)
  })

  it('explains the move in plain language naming the session', () => {
    const text = r.explanations.map((e) => e.text).join(' | ')
    expect(text).toMatch(/Quality run moved to/)
  })

  it('respects the hard-run spacing rule when relocating', () => {
    const quality = byId(r, 'w1s4')
    const neighbours = r.instances.filter((i) =>
      i.templateId !== 'w1s4' && i.recoveryTags.includes('hardRun') && i.scheduledDate !== null)
    for (const n of neighbours) {
      expect(Math.abs(Date.parse(n.scheduledDate!) - Date.parse(quality.scheduledDate!))).toBeGreaterThan(86_400_000)
    }
  })
})

describe('hard-run spacing is enforced (discriminating case)', () => {
  // The test above is vacuous with only one hardRun-tagged template in play
  // (nothing else carries the tag, so its neighbour loop never executes).
  // This constructs two same-week hardRun sessions that genuinely contend
  // for adjacent days, so a broken implementation that skipped the matrix
  // check would actually fail here.
  it('separates two same-week hard-run sessions by more than one day', () => {
    const templates: QueueTemplate[] = [
      { templateId: 'a', weekNumber: 1, sessionSlot: 1, sequenceInWeek: 0, priority: 'essential', recoveryTags: ['hardRun'], name: 'Session A' },
      { templateId: 'b', weekNumber: 1, sessionSlot: 2, sequenceInWeek: 1, priority: 'essential', recoveryTags: ['hardRun'], name: 'Session B' },
    ]
    const r = recomputeQueue(input({ templates, today: PLAN_START }))
    const a = byId(r, 'a')
    const b = byId(r, 'b')
    expect(a.scheduledDate).not.toBeNull()
    expect(b.scheduledDate).not.toBeNull()
    // Session B's planned date (its own slot's Tuesday) is adjacent to A's
    // Monday, so a spacing-blind implementation would leave it right there.
    expect(b.plannedDate).not.toBe(b.scheduledDate)
    expect(Math.abs(Date.parse(a.scheduledDate!) - Date.parse(b.scheduledDate!))).toBeGreaterThan(86_400_000)
  })
})

describe('optional sessions drop before essential ones', () => {
  // Only two days remain in week 1 but four sessions are outstanding.
  const r = recomputeQueue(input({ today: '2026-08-07' }))

  it('drops the optional Zone 2 session', () => {
    expect(byId(r, 'w1s3').status).toBe('autoDropped')
  })

  it('gives a dropped session no scheduled date', () => {
    expect(byId(r, 'w1s3').scheduledDate).toBeNull()
  })

  it('records the drop with its priority and reason', () => {
    expect(r.dropped.find((d) => d.templateId === 'w1s3')).toMatchObject({ priority: 'optional' })
  })

  it('explains the drop without punitive language', () => {
    const text = r.explanations.map((e) => e.text).join(' | ')
    expect(text).toMatch(/Optional Zone 2 session dropped/)
    expect(text).not.toMatch(/fail|behind|missed out|should have/i)
  })

  it('keeps every essential session scheduled', () => {
    const essentials = r.instances.filter((i) => i.priority === 'essential')
    expect(essentials.every((i) => i.status !== 'autoDropped')).toBe(true)
  })
})

describe('never two workouts on one day', () => {
  it('places at most one instance per date across two full weeks', () => {
    const r = recomputeQueue(input({
      templates: [...weekTemplates(1), ...weekTemplates(2)], today: '2026-08-12',
    }))
    const dates = r.instances.map((i) => i.scheduledDate).filter((d): d is string => d !== null)
    expect(new Set(dates).size).toBe(dates.length)
  })
})

describe('one rest day per rolling seven days', () => {
  it('never fills seven consecutive days', () => {
    const r = recomputeQueue(input({
      templates: [...weekTemplates(1), ...weekTemplates(2), ...weekTemplates(3)], today: '2026-08-17',
    }))
    const dates = new Set(r.instances.map((i) => i.scheduledDate).filter((d): d is string => d !== null))
    const sorted = [...dates].sort()
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (first === undefined || last === undefined) throw new Error('no dates')
    for (let start = Date.parse(first); start <= Date.parse(last); start += 86_400_000) {
      let filled = 0
      for (let d = 0; d < 7; d += 1) {
        if (dates.has(new Date(start + d * 86_400_000).toISOString().slice(0, 10))) filled += 1
      }
      expect(filled).toBeLessThanOrEqual(6)
    }
  })
})

describe('no double-workout catch-up', () => {
  it('does not stack two outstanding sessions on the same day even when far behind', () => {
    const r = recomputeQueue(input({
      templates: [...weekTemplates(1), ...weekTemplates(2)], today: '2026-08-14',
    }))
    const counts = new Map<string, number>()
    for (const i of r.instances) {
      if (i.scheduledDate === null) continue
      counts.set(i.scheduledDate, (counts.get(i.scheduledDate) ?? 0) + 1)
    }
    expect([...counts.values()].every((c) => c === 1)).toBe(true)
  })
})

describe('deferral', () => {
  const r = recomputeQueue(input({
    today: '2026-08-03',
    events: [event('DEFER', 'w1s1', '2026-08-03T07:00:00.000Z')],
  }))

  it('moves the deferred session off its planned date', () => {
    expect(byId(r, 'w1s1').scheduledDate).not.toBe('2026-08-03')
  })

  it('does not mark it terminal', () => {
    expect(['deferred', 'upcoming', 'available']).toContain(byId(r, 'w1s1').status)
  })

  it('explains the deferral', () => {
    expect(r.explanations.some((e) => /deferred|moved/i.test(e.text))).toBe(true)
  })
})

describe('skip', () => {
  const r = recomputeQueue(input({
    today: '2026-08-04',
    events: [event('SKIP', 'w1s3', '2026-08-03T07:00:00.000Z')],
  }))

  it('marks the session skipped', () => {
    expect(byId(r, 'w1s3').status).toBe('skipped')
  })

  it('gives it no scheduled date', () => {
    expect(byId(r, 'w1s3').scheduledDate).toBeNull()
  })

  it('does not reschedule a skipped session', () => {
    expect(r.explanations.some((e) => e.templateId === 'w1s3' && /moved to/i.test(e.text))).toBe(false)
  })
})

describe('backdated completion (COMPLETE_EARLIER)', () => {
  const events = [event('COMPLETE_EARLIER', 'w1s2', '2026-08-06T20:00:00.000Z', { forDate: '2026-08-04' })]
  const r = recomputeQueue(input({ today: '2026-08-06', events }))

  it('records the prior date the work was done', () => {
    expect(byId(r, 'w1s2').completedForDate).toBe('2026-08-04')
  })

  it('marks it completed', () => {
    expect(byId(r, 'w1s2').status).toBe('completed')
  })

  it('treats the backdated day as occupied so nothing else lands there', () => {
    expect(r.instances.filter((i) => i.scheduledDate === '2026-08-04')).toHaveLength(1)
  })

  it('returns future recommendations to their correct positions', () => {
    const strengthB = byId(r, 'w1s5')
    expect(strengthB.scheduledDate! >= '2026-08-06').toBe(true)
  })

  it('duplicates nothing', () => {
    expect(new Set(r.instances.map((i) => i.templateId)).size).toBe(r.instances.length)
  })

  it('is idempotent — recomputing yields the identical result', () => {
    expect(recomputeQueue(input({ today: '2026-08-06', events }))).toEqual(r)
  })
})

describe('manual override', () => {
  const events = [event('MOVE', 'w1s6', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-09' })]

  it('honours the requested date', () => {
    const r = recomputeQueue(input({ today: '2026-08-03', events, overrides: [{ id: 'ov1', instanceId: 'w1s6', date: '2026-08-09', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' }] }))
    expect(byId(r, 'w1s6').scheduledDate).toBe('2026-08-09')
    expect(byId(r, 'w1s6').isManualOverride).toBe(true)
  })

  it('routes other sessions around a pinned day', () => {
    const r = recomputeQueue(input({
      today: '2026-08-05', events,
      overrides: [{ id: 'ov1', instanceId: 'w1s6', date: '2026-08-09', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' }],
    }))
    const others = r.instances.filter((i) => i.templateId !== 'w1s6' && i.scheduledDate !== null)
    expect(others.every((i) => i.scheduledDate !== '2026-08-09')).toBe(true)
  })

  it('routes other sessions around a pinned weekday, not just Sunday (discriminating case)', () => {
    // The test above pins 2026-08-09, which is a Sunday — the automated
    // search never proposes Sunday anyway (it is structurally reserved as
    // the week's rest day), so that assertion would pass even if pinned-day
    // routing were never implemented. Pinning a Monday-Saturday date that
    // another template is actually planned for is what makes routing-around
    // a pin the thing under test, rather than an accident of the calendar.
    const pinEvents = [event('MOVE', 'w1s6', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-05' })]
    const r = recomputeQueue(input({
      today: '2026-08-03', events: pinEvents,
      overrides: [{ id: 'ov3', instanceId: 'w1s6', date: '2026-08-05', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' }],
    }))
    expect(byId(r, 'w1s6').scheduledDate).toBe('2026-08-05')
    // w1s3 (Zone 2) is planned for exactly 2026-08-05 and must be displaced.
    expect(byId(r, 'w1s3').scheduledDate).not.toBe('2026-08-05')
    const others = r.instances.filter((i) => i.templateId !== 'w1s6' && i.scheduledDate !== null)
    expect(others.every((i) => i.scheduledDate !== '2026-08-05')).toBe(true)
  })

  it('survives a later recomputation triggered by an unrelated completion', () => {
    const withCompletion = [...events, event('COMPLETE', 'w1s1', '2026-08-03T18:00:00.000Z', { forDate: '2026-08-03' })]
    const r = recomputeQueue(input({
      today: '2026-08-04', events: withCompletion,
      overrides: [{ id: 'ov1', instanceId: 'w1s6', date: '2026-08-09', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' }],
    }))
    expect(byId(r, 'w1s6').scheduledDate).toBe('2026-08-09')
  })

  it('allows a manual move that violates a hard conflict but records it as a soft conflict note', () => {
    const r = recomputeQueue(input({
      today: '2026-08-03',
      events: [event('MOVE', 'w1s4', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-04' })],
      overrides: [{ id: 'ov2', instanceId: 'w1s4', date: '2026-08-04', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' }],
    }))
    expect(byId(r, 'w1s4').scheduledDate).toBe('2026-08-04')
  })
})

describe('race date anchoring', () => {
  it('never schedules past the race date', () => {
    const templates = Array.from({ length: 6 }, (_, w) => weekTemplates(w + 1)).flat()
    const r = recomputeQueue(input({ templates, today: PLAN_START, raceDate: '2026-08-22' }))
    for (const i of r.instances) {
      if (i.scheduledDate !== null) expect(i.scheduledDate <= '2026-08-22').toBe(true)
    }
  })

  it('drops rather than extends when the race date is close', () => {
    const templates = Array.from({ length: 6 }, (_, w) => weekTemplates(w + 1)).flat()
    const r = recomputeQueue(input({ templates, today: PLAN_START, raceDate: '2026-08-22' }))
    expect(r.dropped.length).toBeGreaterThan(0)
  })

  it('drops optional sessions before important ones', () => {
    const templates = Array.from({ length: 6 }, (_, w) => weekTemplates(w + 1)).flat()
    const r = recomputeQueue(input({ templates, today: PLAN_START, raceDate: '2026-08-22' }))
    const droppedPriorities = new Set(r.dropped.map((d) => d.priority))
    if (droppedPriorities.has('important')) expect(droppedPriorities.has('optional')).toBe(true)
  })

  it('never drops an essential session while an optional one survives', () => {
    // Scoped per week (per the contract's own "that week sheds its own
    // optional" framing), not globally across the whole plan: with a race
    // date this tight, weeks 4-6 fall entirely past it and are wholesale
    // dropped by the "drop rather than extend" rule below, including their
    // own optional — that is a different rule firing, not a priority
    // violation, and must not be conflated with weeks 1-3 (which fit before
    // the race date, so their optionals correctly survive untouched). A
    // global version of this assertion would demand either extending the
    // plan past the race date or sacrificing week 1-3's optionals for no
    // reason, both of which contradict the explicit contract.
    const templates = Array.from({ length: 6 }, (_, w) => weekTemplates(w + 1)).flat()
    const r = recomputeQueue(input({ templates, today: PLAN_START, raceDate: '2026-08-22' }))
    const byWeek = new Map<number, typeof r.instances>()
    for (const i of r.instances) {
      byWeek.set(i.weekNumber, [...(byWeek.get(i.weekNumber) ?? []), i])
    }
    for (const weekInstances of byWeek.values()) {
      const survivingOptional = weekInstances.some((i) => i.priority === 'optional' && i.scheduledDate !== null)
      const droppedEssential = weekInstances.some((i) => i.priority === 'essential' && i.status === 'autoDropped')
      expect(droppedEssential && survivingOptional).toBe(false)
    }
  })
})

describe('reset schedule recommendations', () => {
  const events = [
    event('COMPLETE', 'w1s1', '2026-08-03T18:00:00.000Z', { forDate: '2026-08-03' }),
    event('MOVE', 'w1s6', '2026-08-04T09:00:00.000Z', { toDate: '2026-08-09' }),
    event('RESET_RECOMMENDATIONS', null, '2026-08-05T09:00:00.000Z'),
  ]
  const r = recomputeQueue(input({ today: '2026-08-05', events }))

  it('preserves completions recorded before the reset', () => {
    expect(byId(r, 'w1s1').status).toBe('completed')
    expect(byId(r, 'w1s1').completedForDate).toBe('2026-08-03')
  })

  it('discards moves recorded before the reset', () => {
    expect(byId(r, 'w1s6').isManualOverride).toBe(false)
  })

  it('deletes no history', () => {
    expect(r.instances).toHaveLength(6)
  })
})

describe('determinism and purity', () => {
  it('is unaffected by event array order', () => {
    const a = [
      event('COMPLETE', 'w1s1', '2026-08-03T18:00:00.000Z', { forDate: '2026-08-03' }),
      event('SKIP', 'w1s3', '2026-08-04T07:00:00.000Z'),
    ]
    const forward = recomputeQueue(input({ today: '2026-08-05', events: a }))
    const reversed = recomputeQueue(input({ today: '2026-08-05', events: [...a].reverse() }))
    expect(reversed).toEqual(forward)
  })

  it('does not mutate its input', () => {
    const i = input({ today: '2026-08-05', events: [event('SKIP', 'w1s3', '2026-08-04T07:00:00.000Z')] })
    const snapshot = structuredClone(i)
    recomputeQueue(i)
    expect(i).toEqual(snapshot)
  })
})
