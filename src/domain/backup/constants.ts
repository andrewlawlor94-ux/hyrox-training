/** Literal marker identifying a HYROX Training backup file, checked verbatim
 * on import so an unrelated JSON file is rejected as `wrongFormat` rather
 * than partially imported. */
export const BACKUP_FORMAT = 'hyrox-training-backup'

/**
 * The newest backup `schemaVersion` this build knows how to import. A backup
 * at or below this number is importable (older schemas migrate forward by
 * simply being read with today's field set); anything above it is rejected
 * as `futureSchema`, because a future build's file may contain fields this
 * build would silently drop.
 *
 * This deliberately mirrors `SCHEMA_VERSION` in `src/data/schema.ts` rather
 * than importing it: the domain layer's purity guard (see eslint.config.js)
 * blocks every domain file except `src/domain/types.ts` from importing
 * `@/data/**`, so `validateBackup` — which must stay pure and Dexie-free —
 * cannot reach the data layer's constant directly. `src/data/backup/__tests__/roundTrip.test.ts`
 * asserts the two stay equal, so a bump to one without the other fails the
 * suite instead of silently drifting.
 */
export const SUPPORTED_SCHEMA_VERSION = 1

/**
 * Every table that is part of the portable backup — exported, validated,
 * and restored as one unit. Mirrors the keys of `STORES_V1` in
 * `src/data/schema.ts` (same manual-sync reasoning as
 * `SUPPORTED_SCHEMA_VERSION` above; the same round-trip test pins the two
 * lists equal) with one deliberate omission: `safetyBackups`.
 *
 * `safetyBackups` holds the single local pre-import snapshot
 * (`importBackup` writes it immediately before the destructive restore) — it
 * is machine-local safety-net state, not portable athlete history. Excluding
 * it here is what lets `importBackup` write that snapshot and then run its
 * "clear every backup table, bulkPut the imported rows" step without the
 * snapshot it just wrote being wiped out or overwritten by whatever
 * `safetyBackups` content happened to be in the *imported* file.
 */
export const BACKUP_TABLES = [
  'exercises',
  'workoutInstances',
  'instancePrescriptions',
  'strengthSets',
  'runLogs',
  'intervalSplits',
  'stationLogs',
  'symptomLogs',
  'scheduleEvents',
  'scheduleOverrides',
  'queueExplanations',
  'prescriptions',
  'workoutTemplates',
  'planWeeks',
  'planPhases',
  'plans',
  'raceGoals',
  'hyroxStandards',
  'milestoneState',
  'settings',
  'athleteProfile',
  'restTimerState',
] as const

/** One foreign-key-shaped relationship checked by `validateBackup`: every
 * `table[field]` value must name an `id` present in `references`. */
export interface ReferentialCheck {
  table: string
  field: string
  references: string
}

export const REFERENTIAL_CHECKS: readonly ReferentialCheck[] = [
  { table: 'strengthSets', field: 'instanceId', references: 'workoutInstances' },
  { table: 'instancePrescriptions', field: 'instanceId', references: 'workoutInstances' },
  { table: 'intervalSplits', field: 'runLogId', references: 'runLogs' },
  { table: 'runLogs', field: 'instanceId', references: 'workoutInstances' },
  { table: 'stationLogs', field: 'instanceId', references: 'workoutInstances' },
  { table: 'prescriptions', field: 'templateId', references: 'workoutTemplates' },
  { table: 'workoutTemplates', field: 'planId', references: 'plans' },
]
