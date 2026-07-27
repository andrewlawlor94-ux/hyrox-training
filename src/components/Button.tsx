import type { ButtonHTMLAttributes, FC, MouseEvent } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
type ButtonSize = 'md' | 'sm'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

/**
 * Native <button> styled from tokens. `disabled` maps straight to the native
 * `disabled` attribute so the platform blocks click dispatch unconditionally
 * (needed for data-integrity cases like guarding against double-submitting a
 * logged set) rather than relying on a JS guard that only holds once React has
 * finished re-rendering with the new prop. The JS guard below is kept as
 * defence in depth, not as the primary mechanism. Assistive tech already
 * receives the disabled state from the native attribute, so `aria-disabled`
 * is not also set.
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
      disabled={disabled}
      onClick={handleClick}
    >
      {children}
    </button>
  )
}
