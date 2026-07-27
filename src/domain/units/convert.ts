import type { Load, Unit } from '@/domain/types'
import { KG_PER_LB } from './constants'

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

/**
 * Converts a load between lb and kg. A `custom` unit is opaque and never
 * converted in either direction — the caller's value is returned untouched.
 */
export function convertLoad(load: Load, to: Unit): Load {
  if (load.unit === to || load.unit === 'custom' || to === 'custom') return load
  const value = to === 'kg' ? lbToKg(load.value) : kgToLb(load.value)
  return { ...load, value, unit: to }
}
