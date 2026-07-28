// Error types and classification for the data layer. `classifyDbError` runs
// on an error path (a failed db.open()), so it must tolerate any input —
// including null, undefined, and non-Error objects — without itself throwing.

export type DbFailureKind = 'quotaExceeded' | 'upgradeBlocked' | 'accessDenied' | 'unknown'

/**
 * Thrown by `openDb()` when IndexedDB cannot be opened. `kind` lets the UI
 * choose a specific message (and, for `quotaExceeded`, offer an export)
 * instead of a blank screen. `cause` retains the original error for logging.
 */
export class DbUnavailableError extends Error {
  readonly kind: DbFailureKind
  override readonly cause?: unknown

  constructor(kind: DbFailureKind, cause?: unknown) {
    super(`Database unavailable: ${kind}`)
    this.name = 'DbUnavailableError'
    this.kind = kind
    this.cause = cause
  }
}

/**
 * Thrown by `assertMutable` when a write targets a frozen (completed)
 * `WorkoutInstance` without an explicit history-edit opt-in. Carries `id` so
 * the failure is actionable rather than a bare "something is immutable".
 */
export class HistoryImmutableError extends Error {
  readonly entity: string
  readonly id: string

  constructor(entity: string, id: string) {
    super(`Cannot write to frozen ${entity} "${id}": history is immutable`)
    this.name = 'HistoryImmutableError'
    this.entity = entity
    this.id = id
  }
}

const QUOTA_NAMES = new Set(['QuotaExceededError'])
const UPGRADE_BLOCKED_NAMES = new Set(['VersionError', 'UpgradeError', 'DatabaseClosedError'])
const ACCESS_DENIED_NAMES = new Set(['SecurityError', 'InvalidStateError'])

/**
 * Maps a raw thrown value (DOMException, Dexie error, or anything else) to a
 * `DbFailureKind`. Deliberately defensive: this runs while already handling
 * a failure, so it must never throw regardless of what it's given.
 */
export function classifyDbError(err: unknown): DbFailureKind {
  if (err === null || typeof err !== 'object') return 'unknown'
  const name = (err as { name?: unknown }).name
  if (typeof name !== 'string') return 'unknown'
  if (QUOTA_NAMES.has(name)) return 'quotaExceeded'
  if (UPGRADE_BLOCKED_NAMES.has(name)) return 'upgradeBlocked'
  if (ACCESS_DENIED_NAMES.has(name)) return 'accessDenied'
  return 'unknown'
}
