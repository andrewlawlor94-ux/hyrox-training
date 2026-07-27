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
})

describe('StatusPill', () => {
  it('conveys status as text, never colour alone', () => {
    render(<StatusPill status="slightlyBehind" />)
    expect(screen.getByText('Slightly behind')).toBeInTheDocument()
  })
})
