import { describe, expect, it } from 'vitest'
import {
  formatDistanceM, formatDuration, formatLoad, formatPace,
  formatRaceTime, formatWithEquivalent, parseRaceTime,
} from '../format'

describe('formatLoad', () => {
  it.each([
    [{ value: 175, unit: 'lb' as const }, '175 lb'],
    [{ value: 24, unit: 'kg' as const }, '24 kg'],
    [{ value: 22.5, unit: 'kg' as const }, '22.5 kg'],
    [{ value: 3, unit: 'custom' as const, customUnitLabel: 'bands' }, '3 bands'],
  ])('formats %o as %s', (load, expected) => {
    expect(formatLoad(load)).toBe(expected)
  })

  it('drops a trailing .0', () => {
    expect(formatLoad({ value: 175.0, unit: 'lb' })).toBe('175 lb')
  })
})

describe('formatWithEquivalent', () => {
  it('shows the pound equivalent of a kilogram load', () => {
    expect(formatWithEquivalent({ value: 152, unit: 'kg' })).toBe('152 kg · ~335 lb')
  })

  it('shows the kilogram equivalent of a pound load', () => {
    expect(formatWithEquivalent({ value: 175, unit: 'lb' })).toBe('175 lb · ~79 kg')
  })

  it('shows no equivalent for a custom unit', () => {
    expect(formatWithEquivalent({ value: 3, unit: 'custom', customUnitLabel: 'bands' })).toBe('3 bands')
  })
})

describe('formatDuration', () => {
  it.each([
    [90, '1:30'],
    [725, '12:05'],
    [3750, '1:02:30'],
    [0, '0:00'],
    [5, '0:05'],
  ])('formats %i seconds as %s', (sec, expected) => {
    expect(formatDuration(sec)).toBe(expected)
  })
})

describe('formatPace', () => {
  it('formats seconds per km', () => {
    expect(formatPace(380)).toBe('6:20/km')
  })

  it('renders an em dash for null rather than NaN or Infinity', () => {
    expect(formatPace(null)).toBe('—')
  })
})

describe('formatDistanceM', () => {
  it.each([[50, '50 m'], [1000, '1 km'], [1500, '1.5 km'], [12500, '12.5 km'], [0, '0 m']])(
    'formats %i m as %s', (m, expected) => { expect(formatDistanceM(m)).toBe(expected) },
  )
})

describe('race time', () => {
  it('formats a target time', () => {
    expect(formatRaceTime(5700)).toBe('1:35:00')
  })

  it.each([['1:35', 5700], ['1:35:00', 5700], ['1:29:30', 5370], ['95:00', 5700]])(
    'parses %s to %i seconds', (text, expected) => { expect(parseRaceTime(text)).toBe(expected) },
  )

  it.each(['', 'abc', '1:2:3:4', '-1:00'])('rejects %s', (text) => {
    expect(parseRaceTime(text)).toBeNull()
  })
})
