import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Task 31 requires asserting that .github/workflows/deploy.yml "parses as
 * YAML" and has specific structure — not just that it contains the right
 * substrings. This project has no YAML-parsing dependency: `js-yaml` sits in
 * node_modules only as an undeclared transitive dependency of eslint (no
 * bundled type declarations, and Task 31's constraints rule out adding a new
 * package). Rather than reach for an unlisted package — which would need an
 * untyped/`any` import resting on another tool's dependency tree — this file
 * implements the small, real, indentation-based subset of YAML that a GitHub
 * Actions workflow actually uses: block mappings, block sequences of
 * mappings, flow sequences like `[main]`, and quoted/bare scalars. It is not
 * a general YAML parser (no anchors, multiline scalars, or flow mappings),
 * but it genuinely parses this file rather than hand-waving "parses" via
 * string matching.
 */

type YamlValue = string | YamlValue[] | YamlMapping
interface YamlMapping {
  [key: string]: YamlValue
}
interface Line {
  indent: number
  text: string
}

function stripComment(line: string): string {
  if (line.trimStart().startsWith('#')) return ''
  const hashIndex = line.indexOf(' #')
  return hashIndex === -1 ? line : line.slice(0, hashIndex)
}

function toLines(content: string): Line[] {
  const out: Line[] = []
  for (const raw of content.split('\n')) {
    const withoutComment = stripComment(raw.replace(/\s+$/, ''))
    const text = withoutComment.trim()
    if (text.length === 0) continue
    out.push({ indent: withoutComment.length - withoutComment.trimStart().length, text })
  }
  return out
}

function parseScalar(raw: string): YamlValue {
  const value = raw.trim()
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    return inner.length === 0 ? [] : inner.split(',').map((v) => parseScalar(v))
  }
  const quoted = (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))
  return quoted ? value.slice(1, -1) : value
}

/** First ':' that separates a mapping key from its value, i.e. followed by
 * whitespace or end-of-string (so it never fires inside e.g. `actions/checkout@v4`). */
function findTopLevelColon(text: string): number {
  const match = /:(\s|$)/.exec(text)
  return match ? match.index : -1
}

/** Parses whatever sits at exactly `indent` at the front of `queue`, consuming
 * those lines. `queue` is shared, mutable state across the recursive calls —
 * simpler than threading a "next index" through every return under
 * `noUncheckedIndexedAccess`, which would make every `lines[i]` read `T | undefined`. */
function parseValue(queue: Line[], indent: number): YamlValue {
  const line = queue[0]
  if (line === undefined || line.indent !== indent) return ''
  return line.text.startsWith('- ') ? parseSequence(queue, indent) : parseMapping(queue, indent)
}

function parseMapping(queue: Line[], indent: number): YamlMapping {
  const result: YamlMapping = {}
  for (;;) {
    const line = queue[0]
    if (line === undefined || line.indent !== indent || line.text.startsWith('- ')) break
    queue.shift()
    const colon = findTopLevelColon(line.text)
    const key = colon === -1 ? line.text.trim() : line.text.slice(0, colon).trim()
    const valueText = colon === -1 ? '' : line.text.slice(colon + 1).trim()
    if (valueText.length > 0) {
      result[key] = parseScalar(valueText)
      continue
    }
    const peek = queue[0]
    result[key] = peek !== undefined && peek.indent > indent ? parseValue(queue, peek.indent) : ''
  }
  return result
}

function parseSequence(queue: Line[], indent: number): YamlValue[] {
  const result: YamlValue[] = []
  for (;;) {
    const line = queue[0]
    if (line === undefined || line.indent !== indent || !line.text.startsWith('- ')) break
    queue.shift()
    const rest = line.text.slice(2)
    // A block-sequence item's mapping keys continue on lines aligned with the
    // column right after "- " (2 characters), regardless of the sequence's own indent.
    const itemIndent = indent + 2
    const colon = findTopLevelColon(rest)
    if (colon === -1) {
      result.push(parseScalar(rest))
      continue
    }
    const key = rest.slice(0, colon).trim()
    const valueText = rest.slice(colon + 1).trim()
    const item: YamlMapping = {}
    if (valueText.length > 0) {
      item[key] = parseScalar(valueText)
    } else {
      const peek = queue[0]
      item[key] = peek !== undefined && peek.indent > itemIndent ? parseValue(queue, peek.indent) : ''
    }
    Object.assign(item, parseMapping(queue, itemIndent))
    result.push(item)
  }
  return result
}

function parseYaml(content: string): YamlMapping {
  return parseMapping(toLines(content), 0)
}

function asMapping(value: YamlValue | undefined, context: string): YamlMapping {
  if (value === undefined || typeof value === 'string' || Array.isArray(value)) {
    throw new Error(`Expected ${context} to be a mapping`)
  }
  return value
}

function asArray(value: YamlValue | undefined, context: string): YamlValue[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${context} to be a sequence`)
  return value
}

function asString(value: YamlValue | undefined, context: string): string {
  if (typeof value !== 'string') throw new Error(`Expected ${context} to be a scalar`)
  return value
}

function labelOf(step: YamlMapping): string {
  const name = step['name']
  if (typeof name === 'string') return name
  const uses = step['uses']
  return typeof uses === 'string' ? uses : ''
}

const workflowPath = join(process.cwd(), '.github', 'workflows', 'deploy.yml')
const raw = readFileSync(workflowPath, 'utf8')
const doc = parseYaml(raw)

function stepsOf(jobName: string): YamlMapping[] {
  const jobs = asMapping(doc['jobs'], 'jobs')
  const job = asMapping(jobs[jobName], `jobs.${jobName}`)
  return asArray(job['steps'], `jobs.${jobName}.steps`).map((s, i) => asMapping(s, `jobs.${jobName}.steps[${i}]`))
}

describe('deploy workflow (.github/workflows/deploy.yml)', () => {
  it('exists and parses as YAML with no tab indentation', () => {
    expect(existsSync(workflowPath)).toBe(true)
    expect(raw.includes('\t')).toBe(false)
    expect(Object.keys(doc).length).toBeGreaterThan(0)
  })

  it('triggers on push to main and on workflow_dispatch, nothing else', () => {
    const on = asMapping(doc['on'], 'on')
    const push = asMapping(on['push'], 'on.push')
    expect(asArray(push['branches'], 'on.push.branches')).toEqual(['main'])
    expect(Object.keys(on)).toEqual(['push', 'workflow_dispatch'])
  })

  it('requests only pages:write and id-token:write beyond read-only repo access', () => {
    const permissions = asMapping(doc['permissions'], 'permissions')
    expect(asString(permissions['contents'], 'permissions.contents')).toBe('read')
    expect(asString(permissions['pages'], 'permissions.pages')).toBe('write')
    expect(asString(permissions['id-token'], 'permissions.id-token')).toBe('write')
  })

  it('builds on Node 24', () => {
    const setupNode = stepsOf('verify-and-build').find((s) => asString(s['uses'] ?? '', 'uses').startsWith('actions/setup-node'))
    const withBlock = asMapping(setupNode?.['with'], 'setup-node.with')
    expect(asString(withBlock['node-version'], 'node-version')).toBe('24')
  })

  it('runs lint, typecheck, and tests, then builds with a repo-derived VITE_BASE, before configuring or uploading to Pages', () => {
    const steps = stepsOf('verify-and-build')
    const labels = steps.map(labelOf)
    const indexOf = (label: string) => labels.indexOf(label)

    const lintIdx = indexOf('Lint')
    const typecheckIdx = indexOf('Typecheck')
    const testIdx = indexOf('Unit and component tests')
    const buildIdx = indexOf('Build')
    const configurePagesIdx = indexOf('actions/configure-pages@v5')
    const uploadArtifactIdx = indexOf('actions/upload-pages-artifact@v3')

    expect(lintIdx).toBeGreaterThanOrEqual(0)
    expect(typecheckIdx).toBeGreaterThan(lintIdx)
    expect(testIdx).toBeGreaterThan(typecheckIdx)
    expect(buildIdx).toBeGreaterThan(testIdx)
    expect(configurePagesIdx).toBeGreaterThan(buildIdx)
    expect(uploadArtifactIdx).toBeGreaterThan(configurePagesIdx)

    const buildEnv = asMapping(steps[buildIdx]?.['env'], 'build.env')
    expect(asString(buildEnv['VITE_BASE'], 'VITE_BASE')).toBe('/${{ github.event.repository.name }}/')
  })

  it('deploys via actions/deploy-pages, gated on the verify-and-build job', () => {
    const jobs = asMapping(doc['jobs'], 'jobs')
    const deploy = asMapping(jobs['deploy'], 'jobs.deploy')
    expect(asString(deploy['needs'], 'jobs.deploy.needs')).toBe('verify-and-build')
    const steps = asArray(deploy['steps'], 'jobs.deploy.steps').map((s) => asMapping(s, 'deploy.step'))
    expect(steps.some((s) => asString(s['uses'] ?? '', 'uses') === 'actions/deploy-pages@v4')).toBe(true)
  })
})

describe('SPA 404 fallback (vite.config.ts)', () => {
  const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8')

  it('copies dist/index.html to dist/404.html on build so a deep-route refresh on GitHub Pages does not 404', () => {
    const copiesIndexTo404 = /closeBundle\s*\(\)\s*\{[\s\S]*?copyFileSync\(\s*index\s*,\s*`\$\{dist\}\/404\.html`\s*\)/
    expect(copiesIndexTo404.test(viteConfig)).toBe(true)
  })

  it('registers the fallback plugin in the build', () => {
    expect(/plugins:\s*\[[^\]]*spaFallback\(\)[^\]]*\]/.test(viteConfig)).toBe(true)
  })
})
