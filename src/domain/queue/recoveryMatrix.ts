import type { ISODate, RecoveryTag } from '@/domain/types'

export type ConflictSeverity = 'hard' | 'soft'

export interface Conflict {
  severity: ConflictSeverity
  reason: string
  againstDate: ISODate
}

interface MatrixRow {
  previous: RecoveryTag
  candidate: RecoveryTag
  severity: ConflictSeverity
}

/**
 * Recovery conflict matrix (§4.2 / §15). This table is the source of truth —
 * it is a faithful, cell-for-cell transcription of the approved design
 * spec's conflict matrix, and any change to matrix behaviour must start by
 * editing the spec's table, not by adding a row here that "feels" right.
 * Only the pairs below carry a conflict; every other combination (including
 * anything paired with `easyRun`, `lowImpactAerobic`, or `recovery` on either
 * side) is intentionally absent, which is what makes "an easy run after
 * anything" and "anything after low-impact aerobic work" conflict-free
 * without needing their own rows — omission from this table *is* the "no
 * conflict" answer.
 *
 * - hardRun/hardRun, hardRun/longRun, longRun/hardRun: "no hard running on
 *   consecutive days" — hardRun and longRun are both forms of hard running
 *   for this rule. `longRun`/`longRun` is deliberately absent: it is not in
 *   the spec's table, the seeded plan never produces two long runs in the
 *   same week, and an invented hard conflict here would only add a spurious
 *   block with no offsetting benefit.
 * - lowerBodyStrength -> hardRun: "no heavy lower-body strength immediately
 *   before running intervals." Deliberately one-directional (a hard run the
 *   day before lower-body strength is not restricted by this rule) and
 *   scoped to `hardRun` only, not `longRun` — "running intervals" names a
 *   specific run type, not every hard run tag.
 * - highImpactStation -> hardRun: soft warning, not a hard block.
 * - lowerBodyStrength -> lowerBodyStrength: soft warning on repeated heavy
 *   lower-body loading with no day between.
 *
 * `raceSimulation` deliberately has no rows here — its recovery rule (2 clear
 * days before hard work resumes) is a different shape (a window, not a
 * single adjacent day) and lives entirely in `simulationClearanceConflict`.
 */
const MATRIX: MatrixRow[] = [
  { previous: 'hardRun', candidate: 'hardRun', severity: 'hard' },
  { previous: 'hardRun', candidate: 'longRun', severity: 'hard' },
  { previous: 'longRun', candidate: 'hardRun', severity: 'hard' },
  { previous: 'lowerBodyStrength', candidate: 'hardRun', severity: 'hard' },
  { previous: 'highImpactStation', candidate: 'hardRun', severity: 'soft' },
  { previous: 'lowerBodyStrength', candidate: 'lowerBodyStrength', severity: 'soft' },
]

/**
 * The severity of placing a session tagged `candidateTags` on the day
 * immediately after one tagged `previousTags`, per the matrix above. Takes
 * the cross product of both tag arrays and returns the most severe match
 * (`hard` beats `soft` beats `null`).
 */
export function conflictBetween(previousTags: RecoveryTag[], candidateTags: RecoveryTag[]): ConflictSeverity | null {
  let worst: ConflictSeverity | null = null
  for (const previous of previousTags) {
    for (const candidate of candidateTags) {
      const row = MATRIX.find((r) => r.previous === previous && r.candidate === candidate)
      if (row === undefined) continue
      if (row.severity === 'hard') return 'hard'
      worst = 'soft'
    }
  }
  return worst
}
