import { describe, expect, it } from 'vitest'
import { convertLoad, kgToLb, lbToKg } from '../convert'

describe('lbToKg / kgToLb', () => {
  it('converts pounds to kilograms', () => {
    expect(lbToKg(100)).toBeCloseTo(45.359237, 6)
  })

  it('converts kilograms to pounds', () => {
    expect(kgToLb(24)).toBeCloseTo(52.9109, 3)
  })

  it('round-trips without drift beyond float precision', () => {
    expect(kgToLb(lbToKg(175))).toBeCloseTo(175, 9)
  })

  it('handles zero', () => {
    expect(lbToKg(0)).toBe(0)
    expect(kgToLb(0)).toBe(0)
  })
})

describe('convertLoad', () => {
  it('converts lb to kg', () => {
    expect(convertLoad({ value: 100, unit: 'lb' }, 'kg')).toEqual({ value: 45.359237, unit: 'kg' })
  })

  it('returns the same load when the unit already matches', () => {
    const load = { value: 175, unit: 'lb' } as const
    expect(convertLoad(load, 'lb')).toEqual(load)
  })

  it('never converts a custom unit', () => {
    const load = { value: 3, unit: 'custom', customUnitLabel: 'bands' } as const
    expect(convertLoad(load, 'kg')).toEqual(load)
  })

  it('never converts TO a custom unit', () => {
    const load = { value: 175, unit: 'lb' } as const
    expect(convertLoad(load, 'custom')).toEqual(load)
  })
})
