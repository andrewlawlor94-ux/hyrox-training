import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface TsconfigShape {
  references?: Array<{ path: string }>
}

describe('project config: tsconfig.node.json project reference', () => {
  it('is wired back in once its inputs exist on disk', () => {
    // tsconfig.node.json's `include` is ['scripts/**/*.mjs', 'playwright.config.ts'].
    // Neither exists yet, so tsconfig.json currently omits the reference to it
    // (TypeScript hard-errors with TS18003 on a referenced project with zero
    // matched input files). See tsconfig.node.json for the full explanation.
    //
    // This assertion is vacuous today (both `if` branches below are false, so
    // it trivially passes) — that's intentional. The moment a later task
    // creates scripts/generate-icons.mjs or playwright.config.ts, this test
    // starts actually checking something, and fails until the reference is
    // restored in tsconfig.json.
    const root = process.cwd()
    const hasNodeConfigInputs =
      existsSync(join(root, 'scripts', 'generate-icons.mjs')) ||
      existsSync(join(root, 'playwright.config.ts'))

    if (!hasNodeConfigInputs) {
      return
    }

    const tsconfig = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8')) as TsconfigShape
    const referencesNodeConfig = (tsconfig.references ?? []).some(
      (reference) => reference.path === './tsconfig.node.json',
    )

    expect(referencesNodeConfig).toBe(true)
  })
})
