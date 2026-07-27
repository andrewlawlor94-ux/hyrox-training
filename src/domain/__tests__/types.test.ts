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

// Field-level completeness of the entity interfaces is gated by the compiler,
// not by this file: src/data/__tests__/types.typecheck.ts holds a fully
// populated literal for every entity, so `npm run typecheck` fails if a
// required field is missing or misnamed. A runtime test cannot check that —
// types are erased before this code executes.
