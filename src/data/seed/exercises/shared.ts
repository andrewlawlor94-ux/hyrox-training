import type { ISOInstant } from '@/data/types'

/**
 * Placeholder `createdAt`/`updatedAt` for the static seed literals below.
 * `seedRunner.seedIfEmpty` always overwrites both fields with the real `now`
 * it receives at insert time, so this value only needs to satisfy the
 * `Exercise`/`HyroxStandard` types -- it is never what actually lands in the
 * athlete's database.
 */
export const SEED_TIMESTAMP: ISOInstant = '2026-01-01T00:00:00.000Z'
