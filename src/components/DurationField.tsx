import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FC } from 'react'
import { formatDuration, parseDuration } from '@/domain/units/format'

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

/** Shown when the field holds something that is not a duration. Names the shape
 * AND gives an example, since "invalid" alone tells the athlete nothing. */
const FORMAT_HINT = 'Enter a duration as mm:ss (e.g. 28:30), h:mm:ss, or a number of minutes.'

/**
 * A duration entered the way a runner says it — `28:30`, `1:05:30`, or just
 * `45` for 45 minutes — instead of a raw seconds count. (Athlete: "the duration
 * is in seconds, can you adjust so I can type minutes and seconds?")
 *
 * Commits on blur, NOT on change, and this is load-bearing rather than
 * stylistic: callers debounce a save per change, and typing "28:30" passes
 * through the intermediate states "2", "28", "28:" — of which "28:" parses as
 * nothing. In `RunBlock` a null duration means "no longer a loggable run" and
 * DELETES the row, so a per-keystroke commit would destroy the athlete's run
 * mid-word. Blur is also where the `NumberField` beside it already flushes.
 *
 * Text that cannot be parsed is kept on screen and reported, never silently
 * committed as `null` — the same rule `GoalSettings` follows for race times:
 * refusing to persist an unparseable value beats guessing at it.
 */
export const DurationField: FC<DurationFieldProps> = ({ id, label, valueSec, onCommit, hideLabel = false }) => {
  const [text, setText] = useState(() => (valueSec === null ? '' : formatDuration(valueSec)))
  const [error, setError] = useState<string | null>(null)
  const isFocused = useRef(false)

  // Resync from the canonical value only while unfocused, so an external write
  // can never rewrite what the athlete is mid-way through typing. Same
  // focus-gated pattern as `NumberField`.
  useEffect(() => {
    if (isFocused.current) return
    setText(valueSec === null ? '' : formatDuration(valueSec))
  }, [valueSec])

  const handleBlur = (): void => {
    isFocused.current = false
    const trimmed = text.trim()
    if (trimmed === '') {
      setError(null)
      onCommit(null)
      return
    }
    const parsed = parseDuration(trimmed)
    if (parsed === null) {
      setError(FORMAT_HINT)
      return
    }
    setError(null)
    // Normalise what is shown to the canonical form, so "90" reads back as
    // "1:30:00" and the athlete can see how it was understood.
    setText(formatDuration(parsed))
    onCommit(parsed)
  }

  const errorId = `${id}-error`

  return (
    <div className="number-field">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'number-field__label'}>{label}</label>
      <div className="number-field__control">
        <input
          id={id}
          type="text"
          // `numeric` rather than `decimal`: a duration has a colon, not a
          // decimal point, and iOS's numeric pad includes one.
          inputMode="numeric"
          className="number-field__input"
          placeholder="mm:ss"
          value={text}
          onFocus={() => { isFocused.current = true }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { setText(event.target.value) }}
          onBlur={handleBlur}
          aria-invalid={error !== null}
          {...(error !== null ? { 'aria-describedby': errorId } : {})}
        />
      </div>
      {error !== null && <p id={errorId} role="alert" className="number-field__error">{error}</p>}
    </div>
  )
}
