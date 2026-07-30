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

/** Peak gain for the expiry tone. Below 1 so it is a cue, not a jump-scare. */
const TONE_PEAK_GAIN = 0.25
/** Ramp applied at the start and end of the tone. Without it the oscillator
 * starts and stops on a discontinuity, which is audible as a click. */
const TONE_RAMP_SEC = 0.01

function audioContextSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext === 'function'
}

/**
 * ONE AudioContext for the page, not one per tone.
 *
 * Constructing a fresh context per expiry was a real defect with two separate
 * failure modes, which together are why the athlete reported the sound "not
 * working" despite being enabled:
 *
 * 1. Browsers cap concurrent AudioContexts (Chrome around six). Nothing here
 *    ever closed one, so after a handful of rest timers construction began to
 *    fail and every later tone was silent — it worked at the start of a session
 *    and stopped partway through.
 * 2. A context created outside a user gesture starts `suspended`. Timer expiry
 *    is not a gesture, so `currentTime` never advanced and the scheduled
 *    `stop()` never arrived: silence, with no error.
 *
 * `primeAudio` fixes (2) by creating and resuming the context during the tap
 * that STARTS the timer, which is a genuine gesture. The context then stays
 * usable for the expiry that follows.
 */
let sharedContext: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (!audioContextSupported()) return null
  if (sharedContext === null || sharedContext.state === 'closed') {
    try {
      sharedContext = new window.AudioContext()
    } catch {
      // Construction can still fail (no output device, hardened privacy mode).
      // Silence is an acceptable outcome; throwing from a timer tick is not.
      return null
    }
  }
  return sharedContext
}

/**
 * Call from a user gesture that precedes a tone — completing a set, which is
 * what starts a rest timer. Creates and resumes the shared context so the tone
 * at expiry is audible. Safe to call repeatedly and safe to call when sound is
 * disabled (it only unlocks; it makes no noise).
 */
export function primeAudio(): void {
  const context = audioContext()
  if (context === null) return
  if (context.state === 'suspended') void context.resume()
}

/** Plays a short tone via the Web Audio API on the shared context, resuming it
 * first in case it was suspended while the app was backgrounded. */
function playTone(): void {
  const context = audioContext()
  if (context === null) return
  // Resume is async; scheduling against `currentTime` still works once it
  // resolves, because the ramp times below are relative to it.
  if (context.state === 'suspended') void context.resume()

  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.value = TONE_FREQUENCY_HZ
  oscillator.connect(gain)
  gain.connect(context.destination)

  const start = context.currentTime
  const end = start + TONE_DURATION_SEC
  // Explicit envelope: ramp up, hold, ramp down. A bare oscillator at full gain
  // clicks at both ends.
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(TONE_PEAK_GAIN, start + TONE_RAMP_SEC)
  gain.gain.setValueAtTime(TONE_PEAK_GAIN, end - TONE_RAMP_SEC)
  gain.gain.linearRampToValueAtTime(0, end)

  oscillator.start(start)
  oscillator.stop(end)
  // Release the nodes once done. The CONTEXT is deliberately kept — that is the
  // whole point of sharing it.
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
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
