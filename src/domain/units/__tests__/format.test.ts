import { describe, expect, it } from 'vitest'
import {
  formatDistanceM, formatDuration, formatLoad, formatPace,
  formatRaceTime, formatWithEquivalent, parseDuration, parseRaceTime,
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

describe('parseDuration', () => {
  // The whole reason this exists separately from parseRaceTime: two parts are
  // ALWAYS MM:SS here. parseRaceTime reads '28:30' as 28 h 30 min, which is
  // right for a race clock and nonsense for a run.
  it('reads two parts as minutes and seconds, never hours and minutes', () => {
    expect(parseDuration('28:30')).toBe(28 * 60 + 30)
    expect(parseDuration('28:30')).not.toBe(parseRaceTime('28:30'))
    expect(parseRaceTime('28:30')).toBe(28 * 3600 + 30 * 60)
  })

  it('reads three parts as hours, minutes and seconds', () => {
    expect(parseDuration('1:05:30')).toBe(3600 + 5 * 60 + 30)
  })

  it('reads a bare number as minutes, matching how a run is prescribed', () => {
    expect(parseDuration('45')).toBe(45 * 60)
    expect(parseDuration('0')).toBe(0)
  })

  it('tolerates whitespace and zero-padding', () => {
    expect(parseDuration('  28:05  ')).toBe(28 * 60 + 5)
    expect(parseDuration('08:05')).toBe(8 * 60 + 5)
  })

  it('accepts out-of-range seconds rather than being pedantic about them', () => {
    expect(parseDuration('2:90')).toBe(2 * 60 + 90)
  })

  it('returns null for anything that is not a duration', () => {
    for (const junk of ['', '   ', 'abc', '28:ab', '1:2:3:4', '-5', '28.5', ':30', '28:']) {
      expect(parseDuration(junk), junk).toBeNull()
    }
  })

  it('round-trips through formatDuration for values it produced', () => {
    for (const text of ['28:30', '1:05:30', '0:45']) {
      const seconds = parseDuration(text)
      expect(seconds).not.toBeNull()
      expect(parseDuration(formatDuration(seconds as number))).toBe(seconds)
    }
  })
})
