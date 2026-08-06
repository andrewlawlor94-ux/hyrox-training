import { describe, expect, it } from 'vitest'
import type { MeasurementType } from '@/domain/types'
import { countsAsDone, primaryMeasureFor } from '../primaryMeasure'

const EVERY_MEASUREMENT: MeasurementType[] = [
  'strengthSets', 'reps', 'duration', 'distance', 'pace', 'timedStation', 'carry', 'mixedStation',
]

describe('primaryMeasureFor', () => {
  /** The athlete's own example: "with weights if I don't enter reps I didn't do
   * it". It holds for body-weight work too, where there is no load at all. */
  it('decides a strength set on its reps, never its load', () => {
    expect(primaryMeasureFor('strengthSets').measure).toBe('reps')
  })

  it('decides a wall-ball station on reps, since that is how it is scored', () => {
    expect(primaryMeasureFor('reps').measure).toBe('reps')
  })

  it('decides a timed station on time, since its distance is fixed by the standard', () => {
    // A 50 m sled push is always 50 m — the time is the only result.
    expect(primaryMeasureFor('timedStation').measure).toBe('time')
  })

  it('decides a duration-prescribed run on time', () => {
    expect(primaryMeasureFor('duration').measure).toBe('time')
  })

  it('decides a distance-prescribed movement on distance, not on a time that may not exist', () => {
    // On a treadmill or a broken-up carry the athlete may have no clean time.
    for (const measurement of ['distance', 'pace', 'carry', 'mixedStation'] as MeasurementType[]) {
      expect(primaryMeasureFor(measurement).measure, measurement).toBe('distance')
    }
  })

  it('never decides on load or RPE for any movement', () => {
    // Station loads are fixed by the HYROX standard and therefore prefilled, so
    // a load carries no evidence that anything was done; RPE is an opinion.
    for (const measurement of EVERY_MEASUREMENT) {
      expect(['reps', 'time', 'distance'], measurement).toContain(primaryMeasureFor(measurement).measure)
    }
  })

  it('names the box and states why, so the rule is never hidden', () => {
    for (const measurement of EVERY_MEASUREMENT) {
      const spec = primaryMeasureFor(measurement)
      expect(spec.label.trim(), measurement).not.toBe('')
      expect(spec.why.trim(), measurement).not.toBe('')
    }
  })

  it('falls back rather than throwing on a measurement it has never heard of', () => {
    const unknown = 'interpretiveDance' as MeasurementType
    expect(primaryMeasureFor(unknown).measure).toBe('distance')
  })

  it('is pure: the same measurement always gives the same spec', () => {
    expect(primaryMeasureFor('strengthSets')).toEqual(primaryMeasureFor('strengthSets'))
  })
})

describe('countsAsDone', () => {
  it('counts a positive number', () => {
    expect(countsAsDone(1)).toBe(true)
    expect(countsAsDone(0.5)).toBe(true)
  })

  /** The assertion-blind-to-validity trap this project keeps re-introducing:
   * `!== null` alone accepts a zero, and zero reps is not a set. */
  it('does not count zero, a blank, or a non-number', () => {
    for (const value of [0, null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      expect(countsAsDone(value), String(value)).toBe(false)
    }
  })
})
