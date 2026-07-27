/** 0-2 is green. */
export const SYMPTOM_GREEN_MAX = 2
/** 3-4 is caution; 5 and above is elevated. */
export const SYMPTOM_CAUTION_MAX = 4
/** A rise of this many points over the recent baseline is flagged. */
export const SYMPTOM_SPIKE_DELTA = 2
/** This many consecutive logs at or above SYMPTOM_PERSISTENCE_MIN_SCORE is flagged. */
export const SYMPTOM_PERSISTENCE_COUNT = 3
export const SYMPTOM_PERSISTENCE_MIN_SCORE = 3
/** Baseline is the mean of up to this many logs immediately preceding the latest. */
export const SYMPTOM_BASELINE_WINDOW = 5
/** Below this many baseline samples the mean is noise, so no spike is flagged. */
export const SYMPTOM_BASELINE_MIN_SAMPLES = 3
/** Charting and flag window. */
export const SYMPTOM_SERIES_WINDOW_DAYS = 90
/** Sciatic score at or above this triggers the red-flag screen (D11). */
export const RED_FLAG_SCREEN_SCIATIC_MIN = 5
export const SYMPTOM_DISCLAIMER = 'Training-load suggestion, not a medical diagnosis.'
/** Reason-string deltas are rendered to this many decimal places. */
export const SYMPTOM_DELTA_DECIMAL_PLACES = 1
