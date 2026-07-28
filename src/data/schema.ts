// Dexie schema definitions: the current schema version and the Dexie index
// string for every table. `STORES_V1` is consumed by migrations/v1.ts —
// keeping the index strings here (rather than inline in the migration) is
// what lets a future STORES_V2 diff cleanly against this file.

/** Bump this and append a new entry to MIGRATIONS when the schema changes. */
export const SCHEMA_VERSION = 1

/**
 * One Dexie index string per table. Primary key `id` is first in every
 * table; additional simple indexes and compound indexes (bracketed,
 * e.g. `[instanceId+setIndex]`) follow as later repository tasks need them
 * for fast lookups rather than full-table scans.
 */
export const STORES_V1 = {
  exercises: 'id, name, category, isArchived, isSeeded',
  workoutInstances:
    'id, planId, templateId, status, scheduledDate, plannedDate, weekNumber, [planId+weekNumber], [status+scheduledDate]',
  instancePrescriptions: 'id, instanceId, exerciseId, [instanceId+order]',
  strengthSets:
    'id, instanceId, exerciseId, instancePrescriptionId, completedAt, [instanceId+setIndex], [exerciseId+completedAt]',
  runLogs: 'id, instanceId, runType, loggedAt',
  intervalSplits: 'id, runLogId, [runLogId+index]',
  stationLogs: 'id, instanceId, station',
  symptomLogs: 'id, instanceId, forDate',
  scheduleEvents: 'id, at, type, instanceId',
  scheduleOverrides: 'id, instanceId, date',
  queueExplanations: 'id, instanceId, weekNumber, at',
  prescriptions: 'id, templateId, exerciseId, [templateId+order]',
  workoutTemplates: 'id, planId, planWeekId, sessionSlot, priority',
  planWeeks: 'id, planId, weekNumber, phaseId',
  planPhases: 'id, planId',
  plans: 'id, status',
  raceGoals: 'id, isActive',
  hyroxStandards: 'id, station, order',
  milestoneState: 'id, key',
  settings: 'id',
  athleteProfile: 'id',
  restTimerState: 'id',
  safetyBackups: 'id',
} as const
