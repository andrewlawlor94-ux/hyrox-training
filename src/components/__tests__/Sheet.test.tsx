import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sheet } from '@/components'

function OpenableSheet({ initialOpen = true }: { initialOpen?: boolean }): ReactElement {
  const [open, setOpen] = useState(initialOpen)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Log a set">
        <button type="button">First field</button>
        <button type="button">Second field</button>
      </Sheet>
    </div>
  )
}

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onClose={vi.fn()} title="Log a set">
        <p>Body</p>
      </Sheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a labelled modal dialog when open', () => {
    render(
      <Sheet open onClose={vi.fn()} title="Log a set">
        <p>Body</p>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Log a set')
  })

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Log a set">
        <button type="button">Inside</button>
      </Sheet>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on a backdrop click but not on a click inside the panel', async () => {
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Log a set">
        <button type="button">Inside</button>
      </Sheet>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }))
    expect(onClose).not.toHaveBeenCalled()

    // The backdrop is the dialog's parent element (see Sheet.tsx markup).
    const backdrop = screen.getByRole('dialog').parentElement
    expect(backdrop).not.toBeNull()
    await userEvent.click(backdrop as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the sheet on open and restores it on close', async () => {
    render(<OpenableSheet initialOpen={false} />)
    const openButton = screen.getByRole('button', { name: 'Open sheet' })
    openButton.focus()
    expect(openButton).toHaveFocus()

    await userEvent.click(openButton)
    // The panel's first focusable element in DOM order is the header's Close
    // button (it precedes the body content).
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(openButton).toHaveFocus()
  })

  it('cycles Tab from the last focusable element back to the first', async () => {
    render(
      <Sheet open onClose={vi.fn()} title="Log a set">
        <button type="button">First field</button>
        <button type="button">Second field</button>
      </Sheet>,
    )
    const first = screen.getByRole('button', { name: 'Close' })
    const last = screen.getByRole('button', { name: 'Second field' })
    last.focus()
    expect(last).toHaveFocus()

    await userEvent.tab()
    expect(first).toHaveFocus()
  })
})
