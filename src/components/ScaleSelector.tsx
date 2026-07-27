import type { FC } from 'react'

type ScaleSelectorProps = {
  label: string
  value: number
  onChange: (value: number) => void
  max?: number
  id: string
  describedBy?: string
}

// Default upper bound of the 0-10 one-tap scale (RPE, shin pain, sciatic symptoms).
const DEFAULT_MAX = 10

/**
 * 0-N one-tap scale: a <fieldset>+<legend> wrapping N+1 radio/label pairs.
 * Each radio is visually hidden; its paired <label> is the visible, ≥44×44px
 * tap target, activated via the native label-for-input relationship.
 */
export const ScaleSelector: FC<ScaleSelectorProps> = ({
  label,
  value,
  onChange,
  max = DEFAULT_MAX,
  id,
  describedBy,
}) => {
  const options = Array.from({ length: max + 1 }, (_, index) => index)
  const groupName = `${id}-group`

  return (
    <fieldset className="scale-selector" aria-describedby={describedBy}>
      <legend className="scale-selector__legend">{label}</legend>
      <div className="scale-selector__row">
        {options.map((option) => {
          const optionId = `${id}-${option}`
          return (
            <span key={option} className="scale-selector__option">
              <input
                type="radio"
                id={optionId}
                name={groupName}
                className="scale-selector__input visually-hidden"
                checked={value === option}
                onChange={() => {
                  onChange(option)
                }}
              />
              <label htmlFor={optionId} className="scale-selector__label">
                {option}
              </label>
            </span>
          )
        })}
      </div>
    </fieldset>
  )
}
