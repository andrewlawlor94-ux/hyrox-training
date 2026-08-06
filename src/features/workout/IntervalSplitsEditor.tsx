import type { FC } from 'react'
import { useEffect, useState } from 'react'
import type { IntervalSpec, IntervalSplit, SplitKind } from '@/data/types'
import { Button, DurationField, NumberField } from '@/components'
import { formatDuration, formatPace } from '@/domain/units/format'
import { splitPaceSecPerKm, summarizeSplits } from '@/domain/pace/intervals'
import { primeAudio } from '@/features/timer/feedback'
import { useRestTimer } from '@/features/timer/useRestTimer'

export interface DraftSplit {
  index: number
  kind: SplitKind
  distanceM?: number
  durationSec?: number
}

interface RowValue { distanceM: number | null; durationSec: number | null }

/** Fallback recovery for the timer button when the prescription names none. */
const FALLBACK_RECOVERY_SEC = 90

/** Grows or shrinks `rows` to exactly `count` entries, keeping every entry
 * that already exists and filling new ones from `makeDefault` — so raising
 * the rep count never discards a split the athlete already edited. */
function resize<T>(rows: T[], count: number, makeDefault: () => T): T[] {
  if (rows.length === count) return rows
  if (rows.length > count) return rows.slice(0, count)
  return [...rows, ...Array.from({ length: count - rows.length }, makeDefault)]
}

/**
 * Assembles the persisted split list in session order.
 *
 * Recoveries sit BETWEEN work reps — four reps have three recoveries, not four.
 * The athlete asked for "a timer between the four works", and that is also the
 * honest shape: after the last rep you cool down, and the cool-down split
 * already records it. A trailing recovery was an empty row that existed only
 * because the loop happened to add one.
 */
function buildDraftSplits(
  warmupSec: number | null, reps: number, workRows: RowValue[], recoveryRows: RowValue[], cooldownSec: number | null,
): DraftSplit[] {
  const out: DraftSplit[] = []
  let index = 0
  if (warmupSec !== null) { out.push({ index, kind: 'warmup', durationSec: warmupSec }); index += 1 }
  for (let i = 0; i < reps; i += 1) {
    const work = workRows[i]
    out.push({
      index, kind: 'work',
      ...(work?.distanceM !== null && work?.distanceM !== undefined ? { distanceM: work.distanceM } : {}),
      ...(work?.durationSec !== null && work?.durationSec !== undefined ? { durationSec: work.durationSec } : {}),
    })
    index += 1
    if (i === reps - 1) continue
    const recovery = recoveryRows[i]
    out.push({ index, kind: 'recovery', ...(recovery?.durationSec !== null && recovery?.durationSec !== undefined ? { durationSec: recovery.durationSec } : {}) })
    index += 1
  }
  if (cooldownSec !== null) out.push({ index, kind: 'cooldown', durationSec: cooldownSec })
  return out
}

function repsFromSpecOrSplits(intervalSpec: IntervalSpec | undefined, initialSplits: IntervalSplit[]): number {
  if (intervalSpec) return intervalSpec.reps
  return initialSplits.filter((s) => s.kind === 'work').length
}

/** The prescription as one sentence, e.g. "4 × 1000 m with 1:30 recovery".
 * `null` when there is no interval prescription to state.
 *
 * Rep distances stay in METRES rather than going through `formatDistanceM`,
 * which would render a kilometre rep as "1 km". Intervals are written and spoken
 * in metres — "4 × 1000m", "3 × 1600m" — and that is what an athlete recognises
 * on the page. */
function prescribedTarget(spec: IntervalSpec | undefined): string | null {
  if (spec === undefined) return null
  const target = spec.workDistanceM !== undefined
    ? `${String(spec.workDistanceM)} m`
    : spec.workSec !== undefined ? formatDuration(spec.workSec) : null
  if (target === null) return `${String(spec.reps)} reps`
  const recovery = spec.recoverySec !== undefined ? ` with ${formatDuration(spec.recoverySec)} recovery` : ''
  return `${String(spec.reps)} × ${target}${recovery}`
}

interface IntervalSplitsEditorProps {
  idPrefix: string
  /** From `prescription.intervalSpec` — the interval template's own uniform
   * targets. Used to prefill and to state what was prescribed. */
  intervalSpec: IntervalSpec | undefined
  /** Already-persisted splits for this run log, if any (editing a session
   * logged earlier). */
  initialSplits: IntervalSplit[]
  onChange: (splits: DraftSplit[]) => void
}

/** Logs rather than rethrows — a fire-and-forget write from a click handler. */
function logAndIgnore(err: unknown): void {
  console.error('Recovery timer failed', err)
}

/**
 * The interval session, laid out as the session is actually run: warm-up, then
 * the reps that count, then cool-down.
 *
 * The athlete asked for this directly — "Quality Run needs to be laid out
 * better. Explain the difference between warm up and work. Put a timer between
 * the four works." What was there before was one undifferentiated grid of
 * fifteen boxes, half of them uniform *targets* duplicating the per-rep rows
 * below them, every duration in raw seconds, and nothing saying which numbers
 * mattered.
 *
 * Three things changed as a result:
 *
 * - **Sections that say what they are for.** Warm-up and cool-down state in
 *   words that they are not counted in the work pace; the work section states
 *   that it is. That distinction is the whole reason the splits exist —
 *   `summarizeSplits` computes pace from work reps only — and it was invisible.
 * - **The prescribed target is stated, not re-editable.** The six uniform
 *   target fields are gone. They set defaults for rows that are already
 *   prefilled from the same prescription, so their only real effect was to make
 *   the athlete wonder which of the two numbers to fill in. Only the rep COUNT
 *   remains editable, because doing three of four reps is a real thing to
 *   record.
 * - **A recovery timer between reps.** One tap after finishing a rep starts the
 *   prescribed recovery on the shared rest timer, so the athlete is not holding
 *   a stopwatch in the other hand.
 */
export const IntervalSplitsEditor: FC<IntervalSplitsEditorProps> = ({ idPrefix, intervalSpec, initialSplits, onChange }) => {
  const hasPrefill = intervalSpec !== undefined || initialSplits.length > 0
  const [open, setOpen] = useState(hasPrefill)
  const [warmupSec, setWarmupSec] = useState<number | null>(intervalSpec?.warmupSec ?? null)
  const [reps, setReps] = useState<number>(repsFromSpecOrSplits(intervalSpec, initialSplits))
  const [cooldownSec, setCooldownSec] = useState<number | null>(intervalSpec?.cooldownSec ?? null)
  const [workRows, setWorkRows] = useState<RowValue[]>(
    () => Array.from({ length: reps }, () => ({ distanceM: intervalSpec?.workDistanceM ?? null, durationSec: intervalSpec?.workSec ?? null })),
  )
  const [recoveryRows, setRecoveryRows] = useState<RowValue[]>(
    () => Array.from({ length: reps }, () => ({ distanceM: null, durationSec: intervalSpec?.recoverySec ?? null })),
  )
  const { start } = useRestTimer()

  useEffect(() => {
    setWorkRows((prev) => resize(prev, reps, () => ({ distanceM: intervalSpec?.workDistanceM ?? null, durationSec: intervalSpec?.workSec ?? null })))
    setRecoveryRows((prev) => resize(prev, reps, () => ({ distanceM: null, durationSec: intervalSpec?.recoverySec ?? null })))
    // Only the row COUNT should react to `reps` — the prescription's own target
    // values are a constant here, not a reason to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reps])

  const draftSplits = buildDraftSplits(warmupSec, reps, workRows, recoveryRows, cooldownSec)

  useEffect(() => {
    onChange(draftSplits)
    // `draftSplits` is rebuilt fresh every render; comparing by its own
    // *inputs* rather than its (always-new) array identity is what makes
    // this fire only when something the athlete actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmupSec, reps, workRows, recoveryRows, cooldownSec])

  if (!open) {
    return (
      <Button variant="quiet" size="sm" onClick={() => { setOpen(true) }}>Add splits</Button>
    )
  }

  const summary = summarizeSplits(draftSplits)
  const target = prescribedTarget(intervalSpec)

  function startRecovery(repNumber: number): void {
    // Unlock audio inside the tap — see `ExerciseCard.handleCompleted` for why
    // an AudioContext created outside a gesture never makes a sound.
    primeAudio()
    const totalSec = recoveryRows[repNumber - 1]?.durationSec ?? intervalSpec?.recoverySec ?? FALLBACK_RECOVERY_SEC
    start({ label: `Recovery after rep ${String(repNumber)}`, totalSec }).catch(logAndIgnore)
  }

  return (
    <div className="interval-session">
      <div className="interval-session__header">
        <div className="interval-session__target">
          <span className="interval-session__target-label">Prescribed</span>
          <strong>{target ?? 'Splits'}</strong>
        </div>
        <Button variant="quiet" size="sm" onClick={() => { setOpen(false) }}>Hide splits</Button>
      </div>

      <section className="interval-section">
        <h4 className="interval-section__heading">Warm-up</h4>
        <p className="interval-section__explainer">
          Easy running before the hard part. Logged so the session total is right, but deliberately
          left out of your work pace — a slow warm-up must not flatter or spoil the reps.
        </p>
        <DurationField id={`${idPrefix}-warmup`} label="Warm-up time" valueSec={warmupSec} onCommit={setWarmupSec} />
      </section>

      <section className="interval-section interval-section--work">
        <h4 className="interval-section__heading">Work</h4>
        <p className="interval-section__explainer">
          The reps that count. These are the only splits your pace, your progress and your race
          projection are built from, so fill in what you actually ran for each one.
        </p>
        <NumberField
          id={`${idPrefix}-reps`} label="Reps" inputMode="numeric" value={reps}
          onChange={(v) => { setReps(v !== null && v > 0 ? Math.round(v) : 0) }}
        />
        <ol className="interval-reps">
          {workRows.map((row, i) => {
            const repNumber = i + 1
            const pace = splitPaceSecPerKm({
              ...(row.distanceM !== null ? { distanceM: row.distanceM } : {}),
              ...(row.durationSec !== null ? { durationSec: row.durationSec } : {}),
            })
            const isLast = repNumber === reps
            return (
              <li className="interval-rep" key={`work-${String(i)}`}>
                <div className="interval-rep__head">
                  <span className="interval-rep__number">{`Rep ${String(repNumber)}`}</span>
                  <span className="interval-rep__pace">{formatPace(pace)}</span>
                </div>
                <div className="interval-rep__fields">
                  <NumberField
                    id={`${idPrefix}-work-${String(i)}-distance`} label={`Work ${String(repNumber)} distance`} unit="m"
                    value={row.distanceM}
                    onChange={(v) => { setWorkRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, distanceM: v } : r))) }}
                  />
                  <DurationField
                    id={`${idPrefix}-work-${String(i)}-duration`} label={`Work ${String(repNumber)} time`}
                    valueSec={row.durationSec}
                    onCommit={(v) => { setWorkRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, durationSec: v } : r))) }}
                  />
                </div>
                {/* Between the reps, never after the last one — the cool-down
                    follows that, not another recovery. */}
                {!isLast && (
                  <div className="interval-rep__recovery">
                    <Button variant="secondary" size="sm" onClick={() => { startRecovery(repNumber) }}>
                      Start recovery
                    </Button>
                    <DurationField
                      id={`${idPrefix}-recovery-${String(i)}-duration`} label={`Recovery ${String(repNumber)}`}
                      valueSec={recoveryRows[i]?.durationSec ?? null}
                      onCommit={(v) => { setRecoveryRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, durationSec: v } : r))) }}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        <p className="interval-session__mean-pace">{`Work-only mean pace: ${formatPace(summary.meanWorkPaceSecPerKm)}`}</p>
      </section>

      <section className="interval-section">
        <h4 className="interval-section__heading">Cool-down</h4>
        <p className="interval-section__explainer">
          Easy running afterwards. Counted in the session total, and — like the warm-up — kept out
          of the work pace.
        </p>
        <DurationField id={`${idPrefix}-cooldown`} label="Cool-down time" valueSec={cooldownSec} onCommit={setCooldownSec} />
      </section>
    </div>
  )
}
