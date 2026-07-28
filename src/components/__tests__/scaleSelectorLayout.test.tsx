import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
// Imported for its side effect: these assertions read computed styles, so the
// real stylesheet has to be in the document (`vitest.config.ts` sets css: true).
import '@/styles/global.css'
import { ScaleSelector } from '@/components'

/**
 * A 0-10 scale is eleven >=44px targets, so it needs >=484px in one row while the
 * widest iPhone viewport is ~430px. It therefore MUST wrap: a `<fieldset>` also
 * carries a UA `min-inline-size: min-content` that stops it shrinking, which
 * previously pushed the whole document to 496px wide at a 375px viewport and
 * produced real horizontal page scroll on the workout screen.
 *
 * These assert the CSS contract that prevents that, not merely that classes were
 * applied — `vitest.config.ts` sets `css: true` so the stylesheet actually
 * applies here.
 */
describe('ScaleSelector layout (no horizontal page scroll)', () => {
  it('lets the fieldset shrink below its content width', () => {
    const { container } = render(<ScaleSelector id="rpe" label="Session RPE" value={0} onChange={vi.fn()} />)
    const fieldset = container.querySelector('fieldset')
    if (!fieldset) throw new Error('expected a fieldset')
    const style = getComputedStyle(fieldset)
    // jsdom serializes a zero length without a unit.
    expect(style.minInlineSize).toBe('0')
    expect(style.maxWidth).toBe('100%')
  })

  it('wraps its options rather than scrolling them horizontally', () => {
    const { container } = render(<ScaleSelector id="rpe" label="Session RPE" value={0} onChange={vi.fn()} />)
    const row = container.querySelector('.scale-selector__row')
    if (!row) throw new Error('expected an options row')
    const style = getComputedStyle(row)
    expect(style.flexWrap).toBe('wrap')
    // A scrolling row would hide the ends of the scale behind a swipe.
    expect(style.overflowX).not.toBe('auto')
    expect(style.overflowX).not.toBe('scroll')
  })

  it('still renders all eleven values at the minimum tap size', () => {
    const { getAllByRole, container } = render(
      <ScaleSelector id="rpe" label="Session RPE" value={0} onChange={vi.fn()} />,
    )
    expect(getAllByRole('radio')).toHaveLength(11)
    const labels = [...container.querySelectorAll('.scale-selector__label')]
    expect(labels).toHaveLength(11)

    // jsdom does not resolve custom properties in computed styles, so assert the
    // chain instead: every label sizes itself from --tap-min, and --tap-min is
    // 44px. Together those give the real guarantee.
    for (const label of labels) {
      const style = getComputedStyle(label)
      expect(style.minWidth).toBe('var(--tap-min)')
      expect(style.minHeight).toBe('var(--tap-min)')
    }
    expect(getComputedStyle(document.documentElement).getPropertyValue('--tap-min').trim()).toBe('44px')
  })
})
