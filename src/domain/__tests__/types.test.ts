import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('domain type barrel', () => {
  const barrel = readFileSync(join(process.cwd(), 'src', 'domain', 'types.ts'), 'utf8')

  it('re-exports the data entity types', () => {
    expect(barrel).toMatch(/export type \* from '@\/data\/types'/)
  })

  it('contains no runtime imports', () => {
    expect(barrel).not.toMatch(/^import (?!type)/m)
  })
})

describe('entity types compile against representative values', () => {
  it('accepts a fully populated strength set', async () => {
    const { KG_PER_LB } = await import('@/domain/units/constants')
    expect(KG_PER_LB).toBeCloseTo(0.45359237, 8)
  })
})
