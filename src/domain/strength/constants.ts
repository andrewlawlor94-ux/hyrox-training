/** Epley loses accuracy past ~12 reps, so estimates above this are withheld. */
export const EPLEY_MAX_REPS = 12
/** Below this many qualifying sessions a 1RM trend line is noise, not signal. */
export const ONE_RM_MIN_SESSIONS = 3
/** Epley's formula: 1RM = weight * (1 + reps / EPLEY_REPS_DIVISOR). */
export const EPLEY_REPS_DIVISOR = 30
