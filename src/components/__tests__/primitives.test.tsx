import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button, NumberField, ScaleSelector, SegmentedControl, StatusPill } from '@/components'

describe('Button', () => {
  it('renders an accessible button and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Start</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire when disabled', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick} disabled>Start</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('sets the native disabled attribute, not just aria-disabled', () => {
    render(<Button disabled>Start</Button>)
    const button = screen.getByRole('button', { name: 'Start' })
    // Native disabled blocks click dispatch at the platform level regardless of
    // React re-render timing; aria-disabled alone would not. See Button.tsx.
    expect(button).toBeDisabled()
    expect(button).not.toHaveAttribute('aria-disabled')
  })
})

describe('NumberField', () => {
  it('associates its label with the input', () => {
    render(<NumberField id="w" label="Weight" value={180} onChange={vi.fn()} unit="lb" />)
    // NumberField renders <input type="text" inputMode="decimal"> deliberately (never
    // type="number" — see NumberField.tsx). jest-dom's toHaveValue only coerces the DOM
    // value to a number for input[type="number"]; for type="text" it compares the raw
    // string value with strict `===`. Verified empirically against
    // @testing-library/jest-dom@6.9.1: a `type="text"` input can never satisfy
    // `toHaveValue(180)` (number) — only `toHaveValue('180')` (string). This is a fix to
    // an assertion that was inconsistent with the brief's own type="text" contract, made
    // with the task coordinator's explicit approval; see task-2-report.md.
    expect(screen.getByLabelText(/Weight/)).toHaveValue('180')
  })

  it('emits null when cleared rather than NaN', async () => {
    const onChange = vi.fn()
    render(<NumberField id="w" label="Weight" value={180} onChange={onChange} />)
    await userEvent.clear(screen.getByLabelText(/Weight/))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('emits a parsed number on input', async () => {
    const onChange = vi.fn()
    render(<NumberField id="w" label="Weight" value={null} onChange={onChange} />)
    await userEvent.type(screen.getByLabelText(/Weight/), '185')
    expect(onChange).toHaveBeenLastCalledWith(185)
  })

  it('does not rewrite a leading zero while focused (typing "0" then "5" reads "05")', async () => {
    const onChange = vi.fn()
    render(<NumberField id="w" label="Weight" value={null} onChange={onChange} />)
    const input = screen.getByLabelText(/Weight/)
    await userEvent.click(input) // focus
    await userEvent.type(input, '0')
    expect(input).toHaveValue('0')
    await userEvent.type(input, '5')
    // Before the fix: the `value` effect resynced the buffer from
    // toText(onChange's last value) = toText(5) = "5" on every keystroke,
    // clobbering the "0" the user had just typed.
    expect(input).toHaveValue('05')
  })

  it('does not let a parent that clamps the echoed value clobber in-progress typing', async () => {
    function ClampingParent(): ReactElement {
      const [value, setValue] = useState<number | null>(0)
      return (
        <NumberField
          id="w"
          label="Weight"
          value={value}
          onChange={(next) => setValue(next === null ? null : Math.min(next, 999))}
        />
      )
    }
    render(<ClampingParent />)
    const input = screen.getByLabelText(/Weight/)
    await userEvent.click(input)
    await userEvent.clear(input)
    await userEvent.type(input, '05')
    // The parent echoes back the clamped numeric value (5), whose canonical
    // string form ("5") differs from what's in the buffer ("05"). Because the
    // field is still focused, the value-driven resync must not fire.
    expect(input).toHaveValue('05')
  })

  it('resyncs the buffer from value when not focused', () => {
    function Wrapper({ value }: { value: number | null }): ReactElement {
      return <NumberField id="w" label="Weight" value={value} onChange={vi.fn()} />
    }
    const { rerender } = render(<Wrapper value={10} />)
    const input = screen.getByLabelText(/Weight/)
    expect(input).toHaveValue('10')
    rerender(<Wrapper value={42} />)
    expect(input).toHaveValue('42')
  })

  it('resyncs the buffer to the canonical value on blur', async () => {
    function ClampingParent(): ReactElement {
      const [value, setValue] = useState<number | null>(0)
      return (
        <NumberField
          id="w"
          label="Weight"
          value={value}
          onChange={(next) => setValue(next === null ? null : Math.min(next, 999))}
        />
      )
    }
    render(<ClampingParent />)
    const input = screen.getByLabelText(/Weight/)
    await userEvent.click(input)
    await userEvent.clear(input)
    await userEvent.type(input, '05')
    expect(input).toHaveValue('05')
    await userEvent.tab() // blur
    expect(input).toHaveValue('5')
  })
})

describe('ScaleSelector', () => {
  it('renders 0-10 as radio options and reports the chosen value', async () => {
    const onChange = vi.fn()
    render(<ScaleSelector id="rpe" label="Session RPE" value={0} onChange={onChange} />)
    expect(screen.getAllByRole('radio')).toHaveLength(11)
    await userEvent.click(screen.getByRole('radio', { name: '7' }))
    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('marks the current value as checked', () => {
    render(<ScaleSelector id="rpe" label="Session RPE" value={4} onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: '4' })).toBeChecked()
  })

  it('carries the class global.css keys its selected/focus-ring styling off of', () => {
    // global.css targets `.scale-selector__input:checked + .scale-selector__label`
    // and the `:focus-visible` equivalent. If the rendered <input> only has
    // `visually-hidden` (no `scale-selector__input`), those selectors never
    // match and the selected state / focus ring silently never render, even
    // though `:checked` and focus are correct in the DOM. Assert the wiring
    // directly so the CSS/JSX contract can't drift apart again.
    render(<ScaleSelector id="rpe" label="Session RPE" value={4} onChange={vi.fn()} />)
    const radio = screen.getByRole('radio', { name: '4' })
    expect(radio).toHaveClass('scale-selector__input')
    expect(radio).toHaveClass('visually-hidden')
  })
})

describe('SegmentedControl', () => {
  it('reports the selected option', async () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        label="View"
        value="strength"
        onChange={onChange}
        options={[{ value: 'strength', label: 'Strength' }, { value: 'running', label: 'Running' }]}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Running' }))
    expect(onChange).toHaveBeenCalledWith('running')
  })

  it('carries the class global.css keys its selected/focus-ring styling off of', () => {
    render(
      <SegmentedControl
        label="View"
        value="strength"
        onChange={vi.fn()}
        options={[{ value: 'strength', label: 'Strength' }, { value: 'running', label: 'Running' }]}
      />,
    )
    const radio = screen.getByRole('radio', { name: 'Strength' })
    expect(radio).toHaveClass('segmented-control__input')
    expect(radio).toHaveClass('visually-hidden')
  })
})

describe('StatusPill', () => {
  it('conveys status as text, never colour alone', () => {
    render(<StatusPill status="slightlyBehind" />)
    expect(screen.getByText('Slightly behind')).toBeInTheDocument()
  })
})
