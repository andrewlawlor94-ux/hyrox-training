import type { FC, ReactNode } from 'react'
import { Chip } from './Chip'
import type { ChipTone } from './Chip'

type Status = 'ahead' | 'onTrack' | 'slightlyBehind' | 'needsAttention'

type StatusPillProps = {
  status: Status
  children?: ReactNode
}

const STATUS_META: Record<Status, { label: string; tone: ChipTone }> = {
  ahead: { label: 'Ahead', tone: 'green' },
  onTrack: { label: 'On track', tone: 'accent' },
  slightlyBehind: { label: 'Slightly behind', tone: 'caution' },
  needsAttention: { label: 'Needs attention', tone: 'elevated' },
}

/** Status is always conveyed as readable text, paired with (never replaced by) colour. */
export const StatusPill: FC<StatusPillProps> = ({ status, children }) => {
  const { label, tone } = STATUS_META[status]
  return (
    <Chip tone={tone}>
      {label}
      {children}
    </Chip>
  )
}
