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

/** Builds one enveloped beep on the shared context, starting at `startTime` (an
 * AudioContext timestamp, which may be well in the future). */
function buildTone(context: AudioContext, startTime: number): OscillatorNode | null {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.value = TONE_FREQUENCY_HZ
  oscillator.connect(gain)
  gain.connect(context.destination)

  const end = startTime + TONE_DURATION_SEC
  // Explicit envelope: ramp up, hold, ramp down. A bare oscillator at full gain
  // clicks at both ends.
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(TONE_PEAK_GAIN, startTime + TONE_RAMP_SEC)
  gain.gain.setValueAtTime(TONE_PEAK_GAIN, end - TONE_RAMP_SEC)
  gain.gain.linearRampToValueAtTime(0, end)

  oscillator.start(startTime)
  oscillator.stop(end)
  // Release the nodes once done. The CONTEXT is deliberately kept — that is the
  // whole point of sharing it.
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  return oscillator
}

/** Plays a short tone via the Web Audio API on the shared context, resuming it
 * first in case it was suspended while the app was backgrounded. */
function playTone(): void {
  const context = audioContext()
  if (context === null) return
  // Resume is async; scheduling against `currentTime` still works once it
  // resolves, because the ramp times below are relative to it.
  if (context.state === 'suspended') void context.resume()
  buildTone(context, context.currentTime)
}

/** The beep queued for the current timer, so it can be cancelled if the timer
 * is adjusted, skipped, or replaced. */
let pendingTone: OscillatorNode | null = null

/**
 * Queues the expiry beep IN THE AUDIO GRAPH, `secondsFromNow` ahead of time,
 * and reports whether it was queued.
 *
 * This is what makes the timer audible when the athlete is not looking at the
 * app — their "the timer doesn't go off if I'm in another app". The old
 * behaviour depended on a JavaScript interval noticing the expiry and beeping
 * then, and a backgrounded page's timers are throttled to about once a minute on
 * Android and suspended outright on iOS, so nothing fired until the athlete
 * came back and then it beeped late. A tone handed to the audio thread in
 * advance needs no JavaScript at all when it comes due.
 *
 * It is NOT a guarantee, and the honest limits are worth stating plainly:
 *
 * - Screen off, app still frontmost (a phone in a pocket): works.
 * - Switched to another app on Android or desktop: usually works — the audio
 *   context keeps running.
 * - Switched to another app on iOS/iPadOS: does NOT work. Safari suspends the
 *   audio context when the page is backgrounded, which discards queued audio,
 *   and no web API can wake a suspended page. Only a native app can. The Settings
 *   copy says this rather than implying an alarm that will not come.
 *
 * Long waits are fine: an `AudioContext` timestamp is a double, and a couple of
 * minutes is nothing to it.
 */
export function scheduleTone(secondsFromNow: number): boolean {
  cancelScheduledTone()
  if (secondsFromNow < 0) return false
  const context = audioContext()
  if (context === null) return false
  if (context.state === 'suspended') void context.resume()
  // A suspended context's clock is frozen, so a tone queued against it would
  // come due at the wrong wall-clock moment. Only claim success once running.
  if (context.state !== 'running') return false
  pendingTone = buildTone(context, context.currentTime + secondsFromNow)
  return pendingTone !== null
}

/** Drops a queued beep — the timer was skipped, adjusted, or replaced. Safe to
 * call when nothing is queued. */
export function cancelScheduledTone(): void {
  if (pendingTone === null) return
  try {
    pendingTone.stop()
  } catch {
    // Already stopped, or the context went away. Nothing to undo.
  }
  pendingTone.disconnect()
  pendingTone = null
}

/**
 * Fires the athlete-facing feedback for rest-timer expiry, gated entirely by
 * settings the caller passes in — this function never reads settings itself,
 * so it stays trivially testable and has no live-query dependency. Both
 * channels default off (`defaultSettings` in settingsRepo.ts) and neither
 * ever throws: vibration is skipped outright when unsupported, and sound is
 * skipped when `AudioContext` doesn't exist.
 */
export function playFeedback(
  settings: Pick<AppSettings, 'restSoundEnabled' | 'restVibrationEnabled'>,
  opts?: { skipSound?: boolean },
): void {
  if (settings.restVibrationEnabled && vibrationSupported()) {
    navigator.vibrate(VIBRATE_DURATION_MS)
  }
  // `skipSound` is set when the beep was already queued in the audio graph by
  // `scheduleTone` — playing it again here would double-beep for an athlete who
  // stayed on the screen and watched the timer run out.
  if (settings.restSoundEnabled && opts?.skipSound !== true) {
    playTone()
  }
}
