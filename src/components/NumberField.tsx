import { useEffect, useState } from 'react'
import type { ChangeEvent, FC } from 'react'

type NumberFieldProps = {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  unit?: string
  step?: number
  min?: number
  max?: number
  id: string
  inputMode?: 'decimal' | 'numeric'
  hideLabel?: boolean
}

function toText(value: number | null): string {
  return value === null ? '' : String(value)
}

/**
 * Deliberately `type="text"` + `inputMode`, never `type="number"`: iOS shows
 * spinners and coerces cleared/partial input unpredictably on type="number",
 * which risks a NaN leaking into IndexedDB. Parsing here always yields a
 * finite number or `null` — never NaN.
 *
 * Keeps its own text buffer, synced from `value` via effect rather than
 * rendered straight from the prop: a purely prop-controlled input reverts to
 * `value` on every keystroke whenever the caller doesn't (or can't, e.g.
 * mid-render) echo the parsed number straight back, which would otherwise
 * make typing multi-digit numbers impossible.
 */
export const NumberField: FC<NumberFieldProps> = ({
  label,
  value,
  onChange,
  unit,
  step,
  min,
  max,
  id,
  inputMode = 'decimal',
  hideLabel = false,
}) => {
  const [text, setText] = useState(() => toText(value))

  useEffect(() => {
    setText(toText(value))
  }, [value])

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const raw = event.target.value
    setText(raw)

    const trimmed = raw.trim()
    if (trimmed === '') {
      onChange(null)
      return
    }
    const parsed = Number.parseFloat(trimmed)
    onChange(Number.isFinite(parsed) ? parsed : null)
  }

  const inputClasses = unit ? 'number-field__input number-field__input--with-unit' : 'number-field__input'

  return (
    <div className="number-field">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'number-field__label'}>
        {label}
      </label>
      <div className="number-field__control">
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          value={text}
          onChange={handleChange}
          step={step}
          min={min}
          max={max}
          className={inputClasses}
        />
        {unit ? <span className="number-field__unit">{unit}</span> : null}
      </div>
    </div>
  )
}
