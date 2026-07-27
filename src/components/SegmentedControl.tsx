import { useId } from 'react'
import type { ReactElement } from 'react'

type SegmentedOption<T extends string> = { value: T; label: string }

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}

/** Generic radio-group tab strip. Same accessible pattern as ScaleSelector. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps<T>): ReactElement {
  const groupName = useId()

  return (
    <fieldset className="segmented-control">
      <legend className="segmented-control__legend">{label}</legend>
      <div className="segmented-control__row">
        {options.map((option) => {
          const optionId = `${groupName}-${option.value}`
          return (
            <span key={option.value} className="segmented-control__option">
              <input
                type="radio"
                id={optionId}
                name={groupName}
                className="segmented-control__input visually-hidden"
                checked={option.value === value}
                onChange={() => {
                  onChange(option.value)
                }}
              />
              <label htmlFor={optionId} className="segmented-control__label">
                {option.label}
              </label>
            </span>
          )
        })}
      </div>
    </fieldset>
  )
}
