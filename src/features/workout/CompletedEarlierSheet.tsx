import type { ChangeEvent, FC } from 'react'
import { useState } from 'react'
import type { ISODate } from '@/data/types'
import { Button, Sheet } from '@/components'
import { addDays } from '@/domain/dates'

const YESTERDAY_OFFSET = -1

interface CompletedEarlierSheetProps {
  open: boolean
  today: ISODate
  onClose: () => void
  onConfirm: (forDate: ISODate) => void
}

/** Date picker limited to past dates (§8's "Completed earlier" state) — the
 * `max` attribute caps it at yesterday, so today or any future date is
 * unselectable rather than merely discouraged. */
export const CompletedEarlierSheet: FC<CompletedEarlierSheetProps> = ({ open, today, onClose, onConfirm }) => {
  const maxDate = addDays(today, YESTERDAY_OFFSET)
  const [selected, setSelected] = useState<string>(maxDate)

  function handleChange(event: ChangeEvent<HTMLInputElement>): void { setSelected(event.target.value) }
  function handleConfirm(): void { if (selected) onConfirm(selected) }

  return (
    <Sheet open={open} onClose={onClose} title="Completed earlier">
      <div className="completed-earlier-sheet">
        <div className="completed-earlier-sheet__field">
          <label htmlFor="completed-earlier-date">Date completed</label>
          <input
            id="completed-earlier-date"
            className="completed-earlier-sheet__input"
            type="date"
            max={maxDate}
            value={selected}
            onChange={handleChange}
          />
        </div>
        <Button onClick={handleConfirm}>Log completion</Button>
      </div>
    </Sheet>
  )
}
