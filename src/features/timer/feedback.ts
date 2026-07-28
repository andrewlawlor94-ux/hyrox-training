import type { AppSettings } from '@/data/types'

/** Milliseconds the device vibrates for on rest-timer expiry — a single
 * short pulse, not a pattern, since a longer/repeating buzz mid-workout is
 * more annoying than useful. */
const VIBRATE_DURATION_MS = 200
/** Frequency (Hz) of the lazily-constructed expiry tone. */
const TONE_FREQUENCY_HZ = 880
/** How long the tone plays before its gain node stops it. */
const TONE_DURATION_SEC = 0.2

/** Feature-detects the Vibration API. Absent on iOS Safari — calling
 * `navigator.vibrate` there would throw `TypeError: not a function`, so every
 * call site MUST check this first rather than relying on a try/catch. */
export function vibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

function audioContextSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext === 'function'
}

/** Plays a short tone via the Web Audio API. `AudioContext` is constructed
 * lazily, right here, only when sound is actually enabled — never at module
 * load or on every timer tick — and only when the constructor exists at all
 * (jsdom and some browsers omit it entirely). */
function playTone(): void {
  if (!audioContextSupported()) return
  const context = new window.AudioContext()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.value = TONE_FREQUENCY_HZ
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + TONE_DURATION_SEC)
}

/**
 * Fires the athlete-facing feedback for rest-timer expiry, gated entirely by
 * settings the caller passes in — this function never reads settings itself,
 * so it stays trivially testable and has no live-query dependency. Both
 * channels default off (`defaultSettings` in settingsRepo.ts) and neither
 * ever throws: vibration is skipped outright when unsupported, and sound is
 * skipped when `AudioContext` doesn't exist.
 */
export function playFeedback(settings: Pick<AppSettings, 'restSoundEnabled' | 'restVibrationEnabled'>): void {
  if (settings.restVibrationEnabled && vibrationSupported()) {
    navigator.vibrate(VIBRATE_DURATION_MS)
  }
  if (settings.restSoundEnabled) {
    playTone()
  }
}
