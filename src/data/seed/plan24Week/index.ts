/**
 * The editable 24-week HYROX plan, seeded as structured data (§19). This is
 * the single public import surface for the rest of the app (and Task 16's
 * repositories): `SEED_PHASES` + `SEED_WEEKS_24` are the plan content;
 * everything else here is exported for testability and reuse, not because
 * consumers outside `data/seed` are expected to need it directly.
 */
export { SEED_PHASES, PHASE_TYPICAL_PRIORITY, ZONE2_SLOT, phaseForWeek } from './phases'
export { SEED_WEEKS_24, assertMatchesTypicalEssentialSlots } from './weeks'
export { strengthVolumeFor, buildStrengthA, buildStrengthB } from './strengthTemplates'
export type { StrengthVolume } from './strengthTemplates'
export { RUN_PROGRESSION, zone2MinutesFor } from './runProgression'
export type { WeekRunEntry } from './runProgression'
export type { SeedPhase, SeedPrescription, SeedTemplate, SeedWeek } from './types'
