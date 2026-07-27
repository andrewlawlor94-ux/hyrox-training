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
    } else if (entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('domain layer purity', () => {
  const files = walk(join(process.cwd(), 'src', 'domain'))

  it('finds domain source files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each([
    ['reads the clock via Date.now', /Date\.now\s*\(/],
    ['constructs an ambient Date', /new Date\s*\(\s*\)/],
    ['uses Math.random', /Math\.random\s*\(/],
    ['imports React', /from\s+['"]react['"]/],
    ['imports Dexie', /from\s+['"]dexie/],
    ['imports the data layer', /from\s+['"]@\/data\//],
    ['imports the UI layer', /from\s+['"]@\/(features|components|hooks)\//],
  ])('no domain file %s', (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
