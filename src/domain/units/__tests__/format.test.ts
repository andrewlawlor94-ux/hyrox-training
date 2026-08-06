import { describe, expect, it } from 'vitest'
import {
  formatDistanceM, formatDuration, formatLoad, formatPace,
  clockDigitsFrom, formatClockDigits, formatRaceTime, formatWithEquivalent,
  normalizeClockDigits, parseClockDigits, parseDuration, parseRaceTime,
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

  /**
   * Changed on the athlete's instruction: "take the input as the first two
   * digits are minutes and second two are seconds". A bare number used to mean
   * MINUTES, so '45' was 45 minutes; it is now 45 SECONDS, read the way a
   * stopwatch reads it. Safe only because `DurationField` masks the entry and
   * shows 0:45 as it is typed.
   */
  it('reads a bare run of digits as a clock entry, filling from the seconds end', () => {
    expect(parseDuration('45')).toBe(45)
    expect(parseDuration('45')).not.toBe(45 * 60)
    expect(parseDuration('330')).toBe(3 * 60 + 30)
    expect(parseDuration('2830')).toBe(28 * 60 + 30)
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

describe('clock digit entry', () => {
  it('fills from the seconds end as digits are typed', () => {
    expect(parseClockDigits('4')).toBe(4)
    expect(parseClockDigits('45')).toBe(45)
    expect(parseClockDigits('453')).toBe(4 * 60 + 53)
    expect(parseClockDigits('4530')).toBe(45 * 60 + 30)
    expect(parseClockDigits('14530')).toBe(3600 + 45 * 60 + 30)
    expect(parseClockDigits('114530')).toBe(11 * 3600 + 45 * 60 + 30)
  })

  it('rejects a buffer that is not digits, or is longer than a clock', () => {
    for (const junk of ['', 'ab', '1:30', '1234567']) {
      expect(parseClockDigits(junk), junk).toBeNull()
    }
  })

  /**
   * The middle states are shown UN-normalised on purpose. Rendering '283'
   * through parse-then-format would show 3:23, whose own digits are '323' — so
   * the next keystroke and every backspace would act on digits the athlete never
   * typed, and deleting would not undo typing.
   */
  it('shows the buffer as typed, so typing and deleting stay reversible', () => {
    expect(formatClockDigits('')).toBe('')
    expect(formatClockDigits('4')).toBe('0:04')
    expect(formatClockDigits('45')).toBe('0:45')
    expect(formatClockDigits('283')).toBe('2:83')
    expect(formatClockDigits('2830')).toBe('28:30')
    expect(formatClockDigits('12830')).toBe('1:28:30')
  })

  it('is exactly reversible: deleting a digit returns the previous display', () => {
    const typed = '4530'
    const seen = [1, 2, 3, 4].map((n) => formatClockDigits(typed.slice(0, n)))
    expect(seen).toEqual(['0:04', '0:45', '4:53', '45:30'])
    // Backspacing walks the same list back up.
    for (let n = 4; n > 1; n -= 1) {
      expect(formatClockDigits(typed.slice(0, n - 1))).toBe(seen[n - 2])
    }
  })

  it('drops non-digits so a pasted clock still works', () => {
    expect(normalizeClockDigits('28:30')).toBe('2830')
    expect(normalizeClockDigits('1:05:30')).toBe('10530')
    expect(normalizeClockDigits('abc')).toBe('')
  })

  it('keeps the rightmost digits when the buffer overflows a clock', () => {
    // The seconds end is where entry happens, so the oldest digit falls off.
    expect(normalizeClockDigits('1234567')).toBe('234567')
  })

  it('strips leading zeros without ever emptying the buffer', () => {
    expect(normalizeClockDigits('045')).toBe('45')
    expect(normalizeClockDigits('000')).toBe('0')
    expect(formatClockDigits(normalizeClockDigits('000'))).toBe('0:00')
  })

  it('round-trips a stored value back into the buffer that produced it', () => {
    for (const seconds of [0, 4, 45, 293, 1710, 3930, 42_330]) {
      const digits = clockDigitsFrom(seconds)
      expect(parseClockDigits(digits), String(seconds)).toBe(seconds)
      // And the buffer is already canonical — re-normalising changes nothing.
      expect(normalizeClockDigits(digits), String(seconds)).toBe(digits)
    }
  })
})
