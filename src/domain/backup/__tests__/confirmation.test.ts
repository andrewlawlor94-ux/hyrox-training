import { describe, expect, it } from 'vitest'
import { isDrasticDataLoss, sumCounts } from '../confirmation'

describe('sumCounts', () => {
  it('adds every table count together', () => {
    expect(sumCounts({ a: 3, b: 0, c: 5 })).toBe(8)
  })

  it('is 0 for an empty counts object', () => {
    expect(sumCounts({})).toBe(0)
  })
})

describe('isDrasticDataLoss', () => {
  it('is false when the device is already empty, whatever the file contains', () => {
    expect(isDrasticDataLoss(0, 0)).toBe(false)
    expect(isDrasticDataLoss(0, 500)).toBe(false)
  })

  it('is true when the file is entirely empty but the device has data', () => {
    expect(isDrasticDataLoss(10, 0)).toBe(true)
  })

  it('is true when the file has under half of the device\'s current total', () => {
    expect(isDrasticDataLoss(100, 49)).toBe(true)
  })

  it('is false at exactly half, and false above half', () => {
    expect(isDrasticDataLoss(100, 50)).toBe(false)
    expect(isDrasticDataLoss(100, 90)).toBe(false)
  })

  it('is false when the file has more records than the device', () => {
    expect(isDrasticDataLoss(10, 1000)).toBe(false)
  })
})
