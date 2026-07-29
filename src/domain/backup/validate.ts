import type { ISOInstant } from '@/domain/types'
import { BACKUP_FORMAT, BACKUP_TABLES, REFERENTIAL_CHECKS, SUPPORTED_SCHEMA_VERSION } from './constants'

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  schemaVersion: number
  appVersion: string
  exportedAt: ISOInstant
  counts: Record<string, number>
  data: Record<string, unknown[]>
}

export type ValidationFailure =
  | { kind: 'notJson'; message: string }
  | { kind: 'wrongFormat'; message: string }
  | { kind: 'futureSchema'; message: string; found: number; supported: number }
  | { kind: 'missingTable'; message: string; table: string }
  | { kind: 'countMismatch'; message: string; table: string }
  | { kind: 'brokenReference'; message: string; table: string; field: string }

export type ValidationResult = { ok: true; file: BackupFile } | { ok: false; failure: ValidationFailure }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getField(row: unknown, field: string): unknown {
  return isRecord(row) ? row[field] : undefined
}

/** Structural envelope check only — deep per-table content is validated
 * later so a specific, actionable failure kind is returned instead of this
 * function crashing on a shape it doesn't recognize. */
function isBackupEnvelope(value: unknown): value is BackupFile {
  if (!isRecord(value)) return false
  if (value.format !== BACKUP_FORMAT) return false
  if (typeof value.schemaVersion !== 'number') return false
  if (typeof value.appVersion !== 'string') return false
  if (typeof value.exportedAt !== 'string') return false
  if (!isRecord(value.counts)) return false
  if (!isRecord(value.data)) return false
  return true
}

function fail(failure: ValidationFailure): ValidationResult {
  return { ok: false, failure }
}

/**
 * Pure, Dexie-free validation of a raw backup file string. Never throws —
 * every way the input can be malformed (unparsable JSON, the wrong shape,
 * a too-new schema, a missing/miscounted table, a dangling foreign key)
 * returns a `ValidationFailure` carrying a human-readable `message` instead.
 *
 * Order matters for which single failure is reported first when a file has
 * more than one problem: parse → envelope shape → schema version → every
 * table present → every count agrees → every reference resolves. Each check
 * only runs once the ones before it have passed, so (for example) a
 * `countMismatch` message never fires against a table that's actually
 * missing outright.
 */
export function validateBackup(raw: string): ValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail({ kind: 'notJson', message: 'This file is not valid JSON, so it cannot be read as a backup.' })
  }

  if (!isBackupEnvelope(parsed)) {
    return fail({
      kind: 'wrongFormat',
      message: 'This file doesn\'t look like a HYROX Training backup — it\'s missing the expected format marker.',
    })
  }
  const file = parsed

  if (file.schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    return fail({
      kind: 'futureSchema',
      message: `This backup was made by a newer version of the app (schema ${String(file.schemaVersion)}) than this build supports (schema ${String(SUPPORTED_SCHEMA_VERSION)}). Update the app before importing this file.`,
      found: file.schemaVersion,
      supported: SUPPORTED_SCHEMA_VERSION,
    })
  }

  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(file.data[table])) {
      return fail({
        kind: 'missingTable',
        message: `This backup is missing its "${table}" data — the file may be corrupted or incomplete.`,
        table,
      })
    }
  }

  for (const table of BACKUP_TABLES) {
    const rows = file.data[table] ?? []
    const declaredCount = file.counts[table]
    if (declaredCount !== rows.length) {
      return fail({
        kind: 'countMismatch',
        message: `This backup's "${table}" section reports ${String(declaredCount)} row(s) but actually contains ${String(rows.length)} — the file may be corrupted.`,
        table,
      })
    }
  }

  for (const check of REFERENTIAL_CHECKS) {
    const rows = file.data[check.table] ?? []
    const parentRows = file.data[check.references] ?? []
    const parentIds = new Set(parentRows.map((row) => getField(row, 'id')))
    for (const row of rows) {
      const value = getField(row, check.field)
      if (!parentIds.has(value)) {
        return fail({
          kind: 'brokenReference',
          message: `This backup's "${check.table}" table has a "${check.field}" that doesn't match any row in "${check.references}" — the file may be corrupted.`,
          table: check.table,
          field: check.field,
        })
      }
    }
  }

  return { ok: true, file }
}
