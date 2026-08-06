import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FC } from 'react'
import { clockDigitsFrom, formatClockDigits, normalizeClockDigits, parseClockDigits } from '@/domain/units/format'

interface DurationFieldProps {
  id: string
  label: string
  /** Current value in whole seconds, or `null` when nothing is logged yet. */
  valueSec: number | null
  /**
   * Called on BLUR only, never per keystroke — see the note below on why.
   * Receives `null` when the athlete has cleared the field.
   */
  onCommit: (valueSec: number | null) => void
  hideLabel?: boolean
}

/**
 * A duration typed the way every stopwatch, microwave and phone timer takes
 * one: digits fill from the SECONDS end and shift left, and the field shows the
 * clock it has built so far on every keystroke.
 *
 *     4     ->  0:04
 *     45    ->  0:45
 *     453   ->  4:53
 *     4530  ->  45:30
 *
 * The athlete asked for exactly this — "take the input as the first two digits
 * are minutes and second two are seconds" — after finding they were still typing
 * raw seconds in several places. It replaces an earlier rule where a bare number
 * meant MINUTES, so a 45-minute run is now typed `4500` rather than `45`. That
 * change is only safe because the mask renders the interpretation as it is
 * typed: `4` visibly reads 0:04, so there is nothing left to guess and no
 * unparseable state to report. Pasting `28:30` works too — non-digits are
 * simply dropped.
 *
 * Commits on blur, NOT on change, and this is load-bearing rather than
 * stylistic: callers debounce a save per commit, and every intermediate
 * keystroke of `45:30` is a *valid but wrong* duration (0:04, 0:45, 4:53).
 * Saving those would write four junk values, and in `RunBlock` a duration that
 * momentarily reads 0:04 changes the derived pace. Blur is also where the
 * `NumberField` beside it already flushes.
 */
export const DurationField: FC<DurationFieldProps> = ({ id, label, valueSec, onCommit, hideLabel = false }) => {
  const [digits, setDigits] = useState(() => (valueSec === null ? '' : clockDigitsFrom(valueSec)))
  const isFocused = useRef(false)

  // Resync from the canonical value only while unfocused, so an external write
  // can never rewrite what the athlete is mid-way through typing. Same
  // focus-gated pattern as `NumberField`.
  useEffect(() => {
    if (isFocused.current) return
    setDigits(valueSec === null ? '' : clockDigitsFrom(valueSec))
  }, [valueSec])

  const handleBlur = (): void => {
    isFocused.current = false
    if (digits === '') {
      onCommit(null)
      return
    }
    const parsed = parseClockDigits(digits)
    if (parsed === null) {
      onCommit(null)
      return
    }
    // Re-seed from the committed value so an un-normalised buffer settles into
    // its canonical form: 2:83 reads back as 3:23 once the athlete moves on.
    setDigits(clockDigitsFrom(parsed))
    onCommit(parsed)
  }

  return (
    <div className="number-field">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'number-field__label'}>{label}</label>
      <div className="number-field__control">
        <input
          id={id}
          type="text"
          // `numeric`, so a phone shows a digit pad. The athlete never has to
          // type the colon — the mask inserts it — but one that is pasted or
          // typed anyway is harmless, since non-digits are stripped.
          inputMode="numeric"
          className="number-field__input"
          placeholder="mm:ss"
          value={formatClockDigits(digits)}
          onFocus={() => { isFocused.current = true }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { setDigits(normalizeClockDigits(event.target.value)) }}
          onBlur={handleBlur}
        />
      </div>
    </div>
  )
}
