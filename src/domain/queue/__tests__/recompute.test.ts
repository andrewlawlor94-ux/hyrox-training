import { describe, expect, it } from 'vitest'
import { recomputeQueue as recomputeQueueImpl } from '../recompute'
import type { QueueInput, QueueResult, QueueTemplate } from '../recompute'
import { event, fillerSession, input, PLAN_START, weekTemplates } from './recompute.fixtures'

// Every (input, result) pair produced anywhere in this file is recorded here,
// purely by wrapping the real `recomputeQueue` under the same name — every
// existing call site below is unchanged and transparently contributes a run.
// The "priority ladder invariant holds across every scenario in this file"
// describe block at the end of the file sweeps this array with
// `assertNoCrowdOut`, which is what makes that sweep genuinely file-wide
// rather than scoped to one fixture (Finding A, requirement 2) without
// needing to touch every individual test.
const allRuns: { input: QueueInput; result: QueueResult }[] = []
function recomputeQueue(queueInput: QueueInput): QueueResult {
  const result = recomputeQueueImpl(queueInput)
  allRuns.push({ input: queueInput, result })
  return result
}

function byId(result: ReturnType<typeof recomputeQueue>, templateId: string) {
  const found = result.instances.find((i) => i.templateId === templateId)
  if (!found) throw new Error(`No instance ${templateId}`)
  return found
}

/** The priority ladder's real guarantee (Finding A, fix pass 3): a
 * lower-priority session must never *crowd out* a same-native-week essential
 * — i.e. take a day the essential could otherwise have used. This is a
 * causal property, not "no dropped essential ever coexists with any scheduled
 * lower-priority peer" (fix pass 2's literal-but-wrong reading, which forced
 * a guard that sacrificed lower-priority sessions even when they weren't
 * blocking anything). Tested here by counterfactual: for every `autoDropped`
 * essential, and every scheduled, non-terminal, lower-priority peer of the
 * same `weekNumber`, remove that one peer's template from the input and
 * recompute — if the essential *still* cannot place, the peer was never in
 * its way (the drop was caused by frozen history, a pin, or another
 * essential, none of which the peer's absence changes) and nothing is wrong.
 * If the essential *would* now place, the peer was genuinely crowding it out
 * — a real violation. Terminal statuses (`completed`/`partiallyCompleted`/
 * `skipped`) are historical fact, not competitive placement outcomes, so they
 * are excluded from "peer to test removing", matching the exclusion used
 * before this sweep existed. */
function assertNoCrowdOut(queueInput: QueueInput, r: QueueResult): void {
  const terminal = new Set(['completed', 'partiallyCompleted', 'skipped'])
  const byWeek = new Map<number, QueueResult['instances']>()
  for (const i of r.instances) byWeek.set(i.weekNumber, [...(byWeek.get(i.weekNumber) ?? []), i])

  for (const weekInstances of byWeek.values()) {
    const droppedEssentials = weekInstances.filter((i) => i.priority === 'essential' && i.status === 'autoDropped')
    if (droppedEssentials.length === 0) continue
    const scheduledLowerPriorityPeers = weekInstances.filter((i) => i.priority !== 'essential' && !terminal.has(i.status) && i.scheduledDate !== null)

    for (const essential of droppedEssentials) {
      for (const peer of scheduledLowerPriorityPeers) {
        const withoutPeer = queueInput.templates.filter((t) => t.templateId !== peer.templateId)
        const counterfactual = recomputeQueueImpl({ ...queueInput, templates: withoutPeer })
        const essentialWithoutPeer = counterfactual.instances.find((i) => i.templateId === essential.templateId)
        expect(essentialWithoutPeer?.scheduledDate ?? null).toBeNull()
      }
    }
  }
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
    // Vacuous on its own: with `today === planStartDate` and exactly one
    // template per weekday slot, nothing here would ever need Sunday
    // regardless of whether Sunday-exclusion exists at all (Finding 5c). A
    // dense multi-week catch-up scenario is what actually exercises it — if
    // an off-by-one ever shifted the automated-placement window to include
    // Sunday, some instance in this scenario would land there.
    const dense = recomputeQueue(input({
      templates: [...weekTemplates(1), ...weekTemplates(2), ...weekTemplates(3)], today: '2026-08-17',
    }))
    const isSunday = (date: string): boolean => new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0
    const scheduled = dense.instances.map((i) => i.scheduledDate).filter((d): d is string => d !== null)
    expect(scheduled.length).toBeGreaterThan(0)
    expect(scheduled.some(isSunday)).toBe(false)
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
    // `strengthB.scheduledDate! >= today` is true for *any* successfully
    // placed instance (`attemptOwnWeek` computes `from = laterOf(today,
    // plannedDate)`), so it passes even if backdating logic is entirely
    // broken (Finding 5b). Pin the exact date, and confirm it actually
    // differs from what the same fixture yields without the COMPLETE_EARLIER
    // event, so the assertion is coupled to backdating specifically.
    //
    // Expected date updated for priority-tier placement (Finding A, fix pass
    // 2): essentials (w1s1, w1s4, w1s5 — w1s2 is terminal here) now all claim
    // week 1's remaining days *before* the optional (w1s3) or important
    // (w1s6) session gets a turn, so w1s5 (Strength B, essential) finds room
    // in its own week on Friday 2026-08-07 instead of needing to escalate to
    // week 2's Monday. Under the previous (week, sequence)-only ordering,
    // w1s3 and w1s6 would have already claimed earlier days by the time
    // w1s5's turn came, forcing the escalation to 2026-08-10 — that was an
    // artifact of processing order, not a genuine shortfall, so landing in
    // week 1 is the more correct outcome, not a regression.
    const strengthB = byId(r, 'w1s5')
    expect(strengthB.scheduledDate).toBe('2026-08-07')
    const withoutBackdate = recomputeQueue(input({ today: '2026-08-06', events: [] }))
    expect(byId(withoutBackdate, 'w1s5').scheduledDate).not.toBe(strengthB.scheduledDate)
  })

  it('duplicates nothing', () => {
    expect(new Set(r.instances.map((i) => i.templateId)).size).toBe(r.instances.length)
  })

  it('is idempotent — recomputing yields the identical result', () => {
    expect(recomputeQueue(input({ today: '2026-08-06', events }))).toEqual(r)
  })
})

describe('backdated completion displaces another session (Finding 4)', () => {
  it('attributes the displacement to the backdated completion, not "was missed"', () => {
    // w1s1 (Strength A + sled) is backdated-completed onto 2026-08-04 —
    // which is w1s2's (Easy run) own planned date — so w1s2 must move. The
    // true cause is the backdated completion, not "Tuesday was missed",
    // which was the false causal claim `backdatedExplanation` exists to fix.
    const events = [event('COMPLETE_EARLIER', 'w1s1', '2026-08-05T18:00:00.000Z', { forDate: '2026-08-04' })]
    const r = recomputeQueue(input({ today: '2026-08-05', events }))

    expect(byId(r, 'w1s2').scheduledDate).not.toBe('2026-08-04')
    expect(byId(r, 'w1s2').adjustmentReason).toBe('Easy run + durability moved after your backdated Strength A + sled was recorded.')
    // Only w1s2's own reason is under test here — other sessions in this
    // scenario are displaced for unrelated, genuinely-missed reasons, and
    // legitimately keep "was missed" phrasing; it's specifically w1s2's
    // causal attribution that must not misstate the backdate as a miss.
    expect(byId(r, 'w1s2').adjustmentReason).not.toMatch(/was missed/i)
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
    // w1s1 (Strength A + sled: lowerBodyStrength + highImpactStation) is
    // completed in place on 2026-08-03, so it is genuinely occupying the day
    // before w1s4's pinned target — lowerBodyStrength -> hardRun the next
    // day is a hard conflict in the matrix. Without freezing a neighbour
    // like this, the pin's soft-conflict evaluation (`buildOccupiedAndPins`)
    // runs before any *ordinary*, not-yet-placed instance has claimed a day,
    // so it would see an empty occupied set and (wrongly, for purposes of
    // this test) report no conflict at all — this fixture exercises the
    // real, documented code path instead.
    const r = recomputeQueue(input({
      today: '2026-08-03',
      events: [
        event('COMPLETE', 'w1s1', '2026-08-03T08:00:00.000Z', { forDate: '2026-08-03' }),
        event('MOVE', 'w1s4', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-04' }),
      ],
      overrides: [{ id: 'ov2', instanceId: 'w1s4', date: '2026-08-04', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' }],
    }))
    expect(byId(r, 'w1s4').scheduledDate).toBe('2026-08-04')
    const conflicts = byId(r, 'w1s4').softConflicts
    expect(conflicts.length).toBeGreaterThan(0)
    expect(conflicts.some((c) => /recovery/i.test(c))).toBe(true)
  })
})

describe('pinned overrides never double-book a day (Finding 1)', () => {
  it('honours only one of two pins that target the same date', () => {
    const events = [
      event('MOVE', 'w1s1', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-05' }),
      event('MOVE', 'w1s2', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-05' }),
    ]
    const overrides = [
      { id: 'ov1', instanceId: 'w1s1', date: '2026-08-05', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' },
      { id: 'ov2', instanceId: 'w1s2', date: '2026-08-05', isPinned: true, createdAt: '2026-08-03T10:00:00.000Z' },
    ]
    const r = recomputeQueue(input({ today: '2026-08-03', events, overrides }))

    // Never two instances on the same date, regardless of which pin wins.
    const onTarget = r.instances.filter((i) => i.scheduledDate === '2026-08-05')
    expect(onTarget).toHaveLength(1)

    // The more recently created pin (w1s2, later createdAt) wins; the loser
    // (w1s1) falls through to ordinary automated placement instead of being
    // silently dropped or double-booked.
    expect(byId(r, 'w1s2').scheduledDate).toBe('2026-08-05')
    expect(byId(r, 'w1s2').isManualOverride).toBe(true)
    expect(byId(r, 'w1s1').scheduledDate).not.toBe('2026-08-05')
    expect(byId(r, 'w1s1').scheduledDate).not.toBeNull()
    expect(byId(r, 'w1s1').adjustmentReason).toMatch(/could not be honoured/i)
  })

  it('resolves the collision the same way regardless of overrides/events array order', () => {
    const events = [
      event('MOVE', 'w1s1', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-05' }),
      event('MOVE', 'w1s2', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-05' }),
    ]
    const overrides = [
      { id: 'ov1', instanceId: 'w1s1', date: '2026-08-05', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' },
      { id: 'ov2', instanceId: 'w1s2', date: '2026-08-05', isPinned: true, createdAt: '2026-08-03T10:00:00.000Z' },
    ]
    const forward = recomputeQueue(input({ today: '2026-08-03', events, overrides }))
    const reversed = recomputeQueue(input({ today: '2026-08-03', events: [...events].reverse(), overrides: [...overrides].reverse() }))
    expect(reversed).toEqual(forward)
  })

  it('does not honour a pin onto a date a completed instance already occupies', () => {
    const events = [
      event('COMPLETE', 'w1s1', '2026-08-03T18:00:00.000Z', { forDate: '2026-08-04' }),
      event('MOVE', 'w1s2', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-04' }),
    ]
    const overrides = [{ id: 'ov1', instanceId: 'w1s2', date: '2026-08-04', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' }]
    const r = recomputeQueue(input({ today: '2026-08-03', events, overrides }))

    const onTarget = r.instances.filter((i) => i.scheduledDate === '2026-08-04')
    expect(onTarget).toHaveLength(1)
    expect(onTarget[0]?.templateId).toBe('w1s1')
    expect(byId(r, 'w1s2').scheduledDate).not.toBe('2026-08-04')
    expect(byId(r, 'w1s2').adjustmentReason).toMatch(/could not be honoured/i)
  })

  it('reports isManualOverride: false for a rejected pin, true for the honoured one (Finding B)', () => {
    // Same collision fixture as the first test in this block: w1s2's pin
    // (later createdAt) wins and actually takes effect, so its schedule
    // genuinely reflects a manual override. w1s1's pin is rejected — its
    // template falls through to ordinary automated placement, so nothing
    // about its final schedule was manually overridden, even though a MOVE
    // event exists in its history. `isManualOverride` must track whether the
    // override actually took effect, not merely whether a MOVE event was ever
    // recorded (`replay.ts`'s `applyEvents` sets the flag unconditionally on
    // any MOVE, which is what previously went stale here).
    const events = [
      event('MOVE', 'w1s1', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-05' }),
      event('MOVE', 'w1s2', '2026-08-03T09:00:00.000Z', { toDate: '2026-08-05' }),
    ]
    const overrides = [
      { id: 'ov1', instanceId: 'w1s1', date: '2026-08-05', isPinned: true, createdAt: '2026-08-03T09:00:00.000Z' },
      { id: 'ov2', instanceId: 'w1s2', date: '2026-08-05', isPinned: true, createdAt: '2026-08-03T10:00:00.000Z' },
    ]
    const r = recomputeQueue(input({ today: '2026-08-03', events, overrides }))

    expect(byId(r, 'w1s2').scheduledDate).toBe('2026-08-05')
    expect(byId(r, 'w1s2').isManualOverride).toBe(true)
    expect(byId(r, 'w1s1').scheduledDate).not.toBe('2026-08-05')
    expect(byId(r, 'w1s1').isManualOverride).toBe(false)
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

describe('priority-tier placement resolves essential/lower-priority contention (Finding 2, re-verified under Finding A)', () => {
  it('places the essential ahead of a same-week important contending for the same escalation day', () => {
    // Week 1 is entirely occupied by frozen fillers, so both `imp1`
    // (important) and `ess1` (essential) fail their own week outright and
    // must escalate into week 2. Week 2 has Wed-Sat frozen, leaving only
    // Mon/Tue naturally reachable. Under priority-tier placement, ess1 (the
    // whole essential tier is decided before any important is even
    // attempted) claims Monday outright — no bump is needed, since imp1 has
    // not been placed yet when ess1's turn comes. imp1 is then blocked from
    // Monday (taken) and from Tuesday (hard conflict: adjacent hardRun),
    // so it exhausts both weeks and drops. This is the same net outcome the
    // old reactive bump produced for this particular shape, but reached
    // structurally (by processing order) rather than by un-deciding a
    // previously-placed session.
    const w1Fillers = [
      fillerSession('f1', 1, 1, '2026-08-03'),
      fillerSession('f2', 1, 2, '2026-08-04'),
      fillerSession('f3', 1, 3, '2026-08-05'),
      fillerSession('f4', 1, 4, '2026-08-06'),
      fillerSession('f5', 1, 5, '2026-08-07'),
      fillerSession('f6', 1, 6, '2026-08-08'),
    ]
    const w2Fillers = [
      fillerSession('g3', 2, 3, '2026-08-12'),
      fillerSession('g4', 2, 4, '2026-08-13'),
      fillerSession('g5', 2, 5, '2026-08-14'),
      fillerSession('g6', 2, 6, '2026-08-15'),
    ]
    const imp1: QueueTemplate = { templateId: 'imp1', weekNumber: 1, sessionSlot: 1, sequenceInWeek: 10, priority: 'important', recoveryTags: ['hardRun'], name: 'Important spillover' }
    const ess1: QueueTemplate = { templateId: 'ess1', weekNumber: 1, sessionSlot: 2, sequenceInWeek: 11, priority: 'essential', recoveryTags: ['hardRun'], name: 'Essential target' }

    const fillers = [...w1Fillers, ...w2Fillers]
    const templates = [...fillers.map((f) => f.template), imp1, ess1]
    const events = fillers.map((f) => f.occupyingEvent)

    const queueInput = input({ templates, events, today: '2026-08-03', raceDate: '2027-01-16' })
    const r = recomputeQueue(queueInput)

    expect(byId(r, 'ess1').scheduledDate).toBe('2026-08-10')
    expect(byId(r, 'imp1').status).toBe('autoDropped')
    expect(byId(r, 'imp1').scheduledDate).toBeNull()
    const text = r.explanations.map((e) => e.text).join(' | ')
    expect(text).toMatch(/Important spillover/)
    expect(text).toMatch(/Essential target/)
    assertNoCrowdOut(queueInput, r)
  })

  it('drops a same-week lower-priority peer too, when the essential cannot be rescued at all', () => {
    // Same overall shape, but week 2's only free day (Saturday 2026-08-15) is
    // hard-blocked for the essential specifically (adjacent hardRun filler on
    // the Friday before it) — no reordering can place a `hardRun`-tagged
    // session there, so ess2 drops regardless of algorithm. `opt2` is native
    // to week 2 (a *different* native week from ess2's week 1), so it never
    // contended with ess2 for anything and schedules normally on its own
    // week's free day (2026-08-15) — not a crowd-out, since ess2's failure is
    // caused entirely by frozen history in week 2, unrelated to opt2.
    const w1Fillers = [
      fillerSession('h1', 1, 1, '2026-08-03'),
      fillerSession('h2', 1, 2, '2026-08-04'),
      fillerSession('h3', 1, 3, '2026-08-05'),
      fillerSession('h4', 1, 4, '2026-08-06'),
      fillerSession('h5', 1, 5, '2026-08-07'),
      fillerSession('h6', 1, 6, '2026-08-08'),
    ]
    const w2Fillers = [
      fillerSession('j1', 2, 1, '2026-08-10'),
      fillerSession('j2', 2, 2, '2026-08-11'),
      fillerSession('j3', 2, 3, '2026-08-12'),
      fillerSession('j4', 2, 4, '2026-08-13'),
      fillerSession('j5', 2, 5, '2026-08-14', ['hardRun']),
    ]
    const ess2: QueueTemplate = { templateId: 'ess2', weekNumber: 1, sessionSlot: 1, sequenceInWeek: 10, priority: 'essential', recoveryTags: ['hardRun'], name: 'Essential target 2' }
    const opt2: QueueTemplate = { templateId: 'opt2', weekNumber: 2, sessionSlot: 6, sequenceInWeek: 5, priority: 'optional', recoveryTags: ['easyRun'], name: 'Native week-2 optional' }

    const fillers = [...w1Fillers, ...w2Fillers]
    const templates = [...fillers.map((f) => f.template), ess2, opt2]
    const events = fillers.map((f) => f.occupyingEvent)

    const queueInput = input({ templates, events, today: '2026-08-03', raceDate: '2027-01-16' })
    const r = recomputeQueue(queueInput)

    expect(byId(r, 'ess2').status).toBe('autoDropped')
    // opt2 is placed normally — its own native week (2) has no relationship
    // to ess2's failure (native week 1), so there is nothing for it to yield.
    expect(byId(r, 'opt2').scheduledDate).toBe('2026-08-15')
    assertNoCrowdOut(queueInput, r)
  })

  it('does not sacrifice a same-native-week lower-priority peer when the essential was never crowded out by it (fix pass 3)', () => {
    // The exact counterexample shape from Finding A's original brief: week 1
    // fully frozen; week 2 Mon-Fri frozen with `lowerBodyStrength` (Saturday
    // free); an essential (`ess3`, hardRun) and a lower-priority important
    // (`imp3`, longRun) both *native to week 1*, the important later in
    // sequence. ess3 fails its own week (full) and week 2's only free day,
    // 2026-08-15, is hard-blocked for it specifically (adjacent
    // lowerBodyStrength -> hardRun) — a tag conflict with *frozen history*,
    // not day contention, so no placement order or priority rule can rescue
    // it. imp3 has no such conflict (no lowerBodyStrength -> longRun row) and
    // genuinely does place at 2026-08-15.
    //
    // Fix pass 2 treated this as a violation and added a guard that dropped
    // imp3 too, "in solidarity" with ess3 — the coordinator's review (and my
    // own flagged concern) correctly identified this as wrong: imp3 taking
    // 2026-08-15 never cost ess3 anything, since ess3 could not have used
    // that day regardless of imp3's presence. Dropping imp3 as well loses a
    // second session for an athlete whose whole problem is fitting sessions
    // into the week, with no corresponding benefit. The guard was removed;
    // imp3 now places, and `assertNoCrowdOut` confirms below that this is not
    // a crowd-out: removing imp3 from the input and recomputing still leaves
    // ess3 unplaceable, proving imp3 was never in its way.
    const w1Fillers = [
      fillerSession('k1', 1, 1, '2026-08-03'),
      fillerSession('k2', 1, 2, '2026-08-04'),
      fillerSession('k3', 1, 3, '2026-08-05'),
      fillerSession('k4', 1, 4, '2026-08-06'),
      fillerSession('k5', 1, 5, '2026-08-07'),
      fillerSession('k6', 1, 6, '2026-08-08'),
    ]
    const w2Fillers = [
      fillerSession('m1', 2, 1, '2026-08-10', ['lowerBodyStrength']),
      fillerSession('m2', 2, 2, '2026-08-11', ['lowerBodyStrength']),
      fillerSession('m3', 2, 3, '2026-08-12', ['lowerBodyStrength']),
      fillerSession('m4', 2, 4, '2026-08-13', ['lowerBodyStrength']),
      fillerSession('m5', 2, 5, '2026-08-14', ['lowerBodyStrength']),
    ]
    const ess3: QueueTemplate = { templateId: 'ess3', weekNumber: 1, sessionSlot: 1, sequenceInWeek: 10, priority: 'essential', recoveryTags: ['hardRun'], name: 'Essential 3' }
    const imp3: QueueTemplate = { templateId: 'imp3', weekNumber: 1, sessionSlot: 2, sequenceInWeek: 11, priority: 'important', recoveryTags: ['longRun'], name: 'Important 3' }

    const fillers = [...w1Fillers, ...w2Fillers]
    const templates = [...fillers.map((f) => f.template), ess3, imp3]
    const events = fillers.map((f) => f.occupyingEvent)

    const queueInput = input({ templates, events, today: '2026-08-03', raceDate: '2027-01-16' })
    const r = recomputeQueue(queueInput)

    expect(byId(r, 'ess3').status).toBe('autoDropped')
    expect(byId(r, 'imp3').scheduledDate).toBe('2026-08-15')

    // Explicit counterfactual, spelled out inline (not just via the file-wide
    // sweep) because this is the scenario that motivated the sweep's design:
    // removing imp3 must not let ess3 place — if it did, imp3 really would
    // have been crowding ess3 out, and this test's own premise would be wrong.
    const withoutImp3 = queueInput.templates.filter((t) => t.templateId !== 'imp3')
    const counterfactual = recomputeQueueImpl({ ...queueInput, templates: withoutImp3 })
    expect(counterfactual.instances.find((i) => i.templateId === 'ess3')?.scheduledDate ?? null).toBeNull()

    assertNoCrowdOut(queueInput, r)
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

describe('priority ladder invariant holds across every scenario in this file (Finding A, requirement 2)', () => {
  it('never lets a lower-priority session crowd an essential out of a day it could have used, in any recorded run', () => {
    // `allRuns` is populated by the `recomputeQueue` wrapper at the top of
    // this file, which every call site above (unchanged) transparently feeds
    // — this is a genuine file-wide sweep, not scoped to one fixture, and it
    // runs last (declaration order) so every scenario above has already run.
    // `assertNoCrowdOut` is the causal check (fix pass 3): it does not merely
    // check that no dropped essential coexists with any scheduled
    // lower-priority peer (fix pass 2's over-broad reading) — it recomputes
    // with each candidate peer removed and only fails if the essential would
    // then place, i.e. the peer was genuinely in its way.
    expect(allRuns.length).toBeGreaterThan(0)
    for (const { input: queueInput, result } of allRuns) assertNoCrowdOut(queueInput, result)
  })
})
