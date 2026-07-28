import type { FC } from 'react'
import { useEffect, useState } from 'react'
import type { IntervalSpec, IntervalSplit, SplitKind } from '@/data/types'
import { Button, NumberField } from '@/components'
import { formatPace } from '@/domain/units/format'
import { summarizeSplits } from '@/domain/pace/intervals'

export interface DraftSplit {
  index: number
  kind: SplitKind
  distanceM?: number
  durationSec?: number
}

interface RowValue { distanceM: number | null; durationSec: number | null }

/** Grows or shrinks `rows` to exactly `count` entries, keeping every entry
 * that already exists and filling new ones from `makeDefault` — so raising
 * the rep count never discards a split the athlete already edited. */
function resize<T>(rows: T[], count: number, makeDefault: () => T): T[] {
  if (rows.length === count) return rows
  if (rows.length > count) return rows.slice(0, count)
  return [...rows, ...Array.from({ length: count - rows.length }, makeDefault)]
}

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

interface IntervalSplitsEditorProps {
  idPrefix: string
  /** From `prescription.intervalSpec` — an interval template's own uniform
   * targets, used only to prefill the controls below. */
  intervalSpec: IntervalSpec | undefined
  /** Already-persisted splits for this run log, if any (editing a session
   * logged earlier). */
  initialSplits: IntervalSplit[]
  onChange: (splits: DraftSplit[]) => void
}

/**
 * Optional splits editor (§10/§11): collapsed behind a single control by
 * default so basic run logging never requires opening it, but auto-expanded
 * and prefilled when the prescription itself is an interval template. The
 * top controls (warm-up, reps, work distance/duration, recovery, cooldown)
 * set the UNIFORM targets; the individual per-rep rows below them hold the
 * athlete's actual achieved values, editable independently, defaulting to
 * whatever the uniform target was at the moment the row was created.
 */
export const IntervalSplitsEditor: FC<IntervalSplitsEditorProps> = ({ idPrefix, intervalSpec, initialSplits, onChange }) => {
  const hasPrefill = intervalSpec !== undefined || initialSplits.length > 0
  const [open, setOpen] = useState(hasPrefill)
  const [warmupSec, setWarmupSec] = useState<number | null>(intervalSpec?.warmupSec ?? null)
  const [reps, setReps] = useState<number>(repsFromSpecOrSplits(intervalSpec, initialSplits))
  const [workDistanceM, setWorkDistanceM] = useState<number | null>(intervalSpec?.workDistanceM ?? null)
  const [workSec, setWorkSec] = useState<number | null>(intervalSpec?.workSec ?? null)
  const [recoverySec, setRecoverySec] = useState<number | null>(intervalSpec?.recoverySec ?? null)
  const [cooldownSec, setCooldownSec] = useState<number | null>(intervalSpec?.cooldownSec ?? null)
  const [workRows, setWorkRows] = useState<RowValue[]>(
    () => Array.from({ length: reps }, () => ({ distanceM: intervalSpec?.workDistanceM ?? null, durationSec: intervalSpec?.workSec ?? null })),
  )
  const [recoveryRows, setRecoveryRows] = useState<RowValue[]>(
    () => Array.from({ length: reps }, () => ({ distanceM: null, durationSec: intervalSpec?.recoverySec ?? null })),
  )

  useEffect(() => {
    setWorkRows((prev) => resize(prev, reps, () => ({ distanceM: workDistanceM, durationSec: workSec })))
    setRecoveryRows((prev) => resize(prev, reps, () => ({ distanceM: null, durationSec: recoverySec })))
    // Only the row COUNT should react to `reps` — the target values captured
    // in the default-factory closures are deliberately whatever they were at
    // the moment this ran, not a reason to re-run this effect themselves.
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

  return (
    <div className="interval-splits-editor">
      <div className="interval-splits-editor__header">
        <p className="interval-splits-editor__mean-pace">{`Work-only mean pace: ${formatPace(summary.meanWorkPaceSecPerKm)}`}</p>
        <Button variant="quiet" size="sm" onClick={() => { setOpen(false) }}>Hide splits</Button>
      </div>
      <div className="interval-splits-editor__controls">
        <NumberField id={`${idPrefix}-warmup`} label="Warm-up" unit="s" value={warmupSec} onChange={setWarmupSec} />
        <NumberField id={`${idPrefix}-reps`} label="Reps" inputMode="numeric" value={reps}
          onChange={(v) => { setReps(v !== null && v > 0 ? Math.round(v) : 0) }} />
        <NumberField id={`${idPrefix}-work-distance`} label="Work distance" unit="m" value={workDistanceM} onChange={setWorkDistanceM} />
        <NumberField id={`${idPrefix}-work-duration`} label="Work duration" unit="s" value={workSec} onChange={setWorkSec} />
        <NumberField id={`${idPrefix}-recovery`} label="Recovery" unit="s" value={recoverySec} onChange={setRecoverySec} />
        <NumberField id={`${idPrefix}-cooldown`} label="Cool-down" unit="s" value={cooldownSec} onChange={setCooldownSec} />
      </div>
      <div className="interval-splits-editor__rows">
        {workRows.map((row, i) => (
          <div className="interval-splits-editor__row" key={`work-${String(i)}`}>
            <NumberField id={`${idPrefix}-work-${String(i)}-distance`} label={`Work ${String(i + 1)} distance`} unit="m"
              value={row.distanceM} onChange={(v) => { setWorkRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, distanceM: v } : r))) }} />
            <NumberField id={`${idPrefix}-work-${String(i)}-duration`} label={`Work ${String(i + 1)} duration`} unit="s"
              value={row.durationSec} onChange={(v) => { setWorkRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, durationSec: v } : r))) }} />
            <NumberField id={`${idPrefix}-recovery-${String(i)}-duration`} label={`Recovery ${String(i + 1)}`} unit="s"
              value={recoveryRows[i]?.durationSec ?? null}
              onChange={(v) => { setRecoveryRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, durationSec: v } : r))) }} />
          </div>
        ))}
      </div>
    </div>
  )
}
