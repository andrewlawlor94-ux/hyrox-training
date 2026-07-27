import type { ButtonHTMLAttributes, FC, MouseEvent } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
type ButtonSize = 'md' | 'sm'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

/**
 * Native <button> styled from tokens. `disabled` is deliberately kept out of the
 * native `disabled` attribute: it is surfaced as `aria-disabled` and the click
 * handler is guarded in JS instead, so a disabled button stays focusable and
 * discoverable to assistive tech rather than disappearing from the tab order.
 */
export const Button: FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  disabled = false,
  onClick,
  children,
  ...rest
}) => {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ')

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (disabled) return
    onClick?.(event)
  }

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      aria-disabled={disabled || undefined}
      onClick={handleClick}
    >
      {children}
    </button>
  )
}
