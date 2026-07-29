// Barrel: the single import surface later tasks (hooks/features) use for
// every repository function. Each module owns exactly one aggregate; see the
// Task 16 report for the write-path/guard table.
export * from './settingsRepo'
export * from './profileRepo'
export * from './goalRepo'
export * from './exerciseRepo'
export * from './standardsRepo'
export * from './planRepo'
export * from './workoutRepo'
export * from './logRepo'
export * from './scheduleRepo'
export * from './timerRepo'
export * from './planEditRepo'
export * from './exerciseEditRepo'
export * from './manualMoveRepo'
export * from './workoutMetadataRepo'
export * from './safetyBackupRepo'
export { assertMutable } from './guard'
