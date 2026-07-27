import type { FC, ReactNode } from 'react'

export type ChipTone = 'neutral' | 'accent' | 'green' | 'caution' | 'elevated'

type ChipProps = {
  children: ReactNode
  tone?: ChipTone
}

/** Small labelled tag. Tone is always paired with text — never colour alone. */
export const Chip: FC<ChipProps> = ({ children, tone = 'neutral' }) => (
  <span className={`chip chip--${tone}`}>{children}</span>
)
