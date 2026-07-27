import { useEffect, useId, useRef } from 'react'
import type { FC, KeyboardEvent, MouseEvent, ReactNode } from 'react'

type SheetProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(panel: HTMLDivElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

/**
 * Bottom sheet overlay. Renders nothing when closed. When open: traps focus,
 * closes on Escape and backdrop click, and restores focus to the previously
 * focused element on close. The 150ms present animation is the only motion
 * permitted anywhere in the app (disabled globally under prefers-reduced-motion).
 */
export const Sheet: FC<SheetProps> = ({ open, onClose, title, children }) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusable = panel ? getFocusable(panel) : []
    const first = focusable[0] ?? panel
    first?.focus()

    return () => {
      previouslyFocused.current?.focus()
    }
  }, [open])

  if (!open) return null

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const panel = panelRef.current
    if (!panel) return
    const focusable = getFocusable(panel)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) {
      event.preventDefault()
      return
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const stopPropagation = (event: MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet-panel"
        onClick={stopPropagation}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <div className="sheet-panel__header">
          <h2 id={titleId} className="sheet-panel__title">{title}</h2>
          <button
            type="button"
            className="sheet-panel__close"
            aria-label="Close"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        <div className="sheet-panel__body">{children}</div>
      </div>
    </div>
  )
}
