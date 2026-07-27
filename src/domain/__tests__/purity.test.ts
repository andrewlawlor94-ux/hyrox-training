import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue
      out.push(...walk(full))
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

// Each pattern below must match a bare module specifier (e.g. '@/data') as
// well as any subpath of it (e.g. '@/data/repositories/workoutRepo'), not
// just the subpath form. A pattern anchored only on the trailing '/' (e.g.
// the old /from\s+['"]@\/data\//) silently passes a bare
// `import { db } from '@/data'` — this exact blind spot let a real
// violation through a previous review. The `(\/|['"])` alternation closes
// it: match '@/data' followed by either another path segment or the
// closing quote.
const dataLayerPattern = /from\s+['"]@\/data(\/|['"])/
const uiLayerPattern = /from\s+['"]@\/(features|components|hooks)(\/|['"])/
// Same bare-vs-subpath scrutiny applied to the pre-existing patterns below:
// the 'react' pattern used to require the closing quote immediately after
// 'react', so it missed subpath imports like 'react/jsx-runtime' — the
// mirror image of the @/data gap (there, bare was missed; here, subpaths
// were missed). Fixed with the same '(\/|['"])' alternation.
const reactPattern = /from\s+['"]react(\/|['"])/
// 'dexie' has no trailing anchor at all, so it already matches bare
// ('dexie'), subpaths ('dexie/foo'), and the sibling package
// ('dexie-react-hooks') — no analogous gap here; kept as-is.
const dexiePattern = /from\s+['"]dexie/

describe('domain layer purity', () => {
  const files = walk(join(process.cwd(), 'src', 'domain'))

  it('finds domain source files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each([
    ['reads the clock via Date.now', /Date\.now\s*\(/],
    ['constructs an ambient Date', /new Date\s*\(\s*\)/],
    ['uses Math.random', /Math\.random\s*\(/],
    ['imports React', reactPattern],
    ['imports Dexie', dexiePattern],
    ['imports the data layer', dataLayerPattern],
    ['imports the UI layer', uiLayerPattern],
  ])('no domain file %s', (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})

// These assertions exercise the regexes directly against representative
// import strings, independent of whatever files happen to exist on disk.
// They exist so the bare-import blind spot (and its analogues) cannot
// silently reopen if someone "simplifies" a pattern back to a trailing-slash
// or exact-match form during a later edit.
describe('purity regex patterns (bare vs. subpath import forms)', () => {
  it.each([
    ["import { db } from '@/data'", true],
    ['import { db } from "@/data"', true],
    ["import type { Foo } from '@/data/types'", true],
    ["import { workoutRepo } from '@/data/repositories/workoutRepo'", true],
    ["import { db } from '@/domain'", false],
    ["import { db } from '@/dataOther'", false],
  ])('data-layer pattern on %s -> %s', (source, expected) => {
    expect(dataLayerPattern.test(source)).toBe(expected)
  })

  it.each([
    ["import { Foo } from '@/features'", true],
    ["import { Foo } from '@/features/workouts/Card'", true],
    ["import { Foo } from '@/components'", true],
    ["import { Foo } from '@/components/Button'", true],
    ["import { useX } from '@/hooks'", true],
    ["import { useX } from '@/hooks/useX'", true],
    ["import { Foo } from '@/domain'", false],
    ["import { Foo } from '@/featuresOther'", false],
  ])('UI-layer pattern on %s -> %s', (source, expected) => {
    expect(uiLayerPattern.test(source)).toBe(expected)
  })

  it.each([
    ["import { useState } from 'react'", true],
    ['import { useState } from "react"', true],
    ["import { jsx } from 'react/jsx-runtime'", true],
    ["import { jsx } from 'react/jsx-dev-runtime'", true],
    ["import { render } from 'react-dom'", false],
    ["import { foo } from 'reactive-thing'", false],
  ])('react pattern on %s -> %s', (source, expected) => {
    expect(reactPattern.test(source)).toBe(expected)
  })

  it.each([
    ["import Dexie from 'dexie'", true],
    ['import Dexie from "dexie"', true],
    ["import { liveQuery } from 'dexie/dist/dexie'", true],
    ["import { useLiveQuery } from 'dexie-react-hooks'", true],
    ["import { Foo } from '@/domain'", false],
  ])('dexie pattern on %s -> %s', (source, expected) => {
    expect(dexiePattern.test(source)).toBe(expected)
  })
})
