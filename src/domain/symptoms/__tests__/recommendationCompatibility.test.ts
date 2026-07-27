import { describe, expect, it } from 'vitest'
import type { SymptomLog } from '@/domain/types'
import type { RecommendationSymptomState } from '@/domain/recommendations/increments'
import { evaluateSymptoms } from '../evaluate'

/**
 * Task 7 declared `RecommendationSymptomState` locally (in
 * recommendations/increments.ts) to avoid a circular dependency between the
 * recommendations engine and this symptom evaluator. `SymptomState` must
 * structurally satisfy that interface — `.shin` and `.sciatic` each need
 * `level`, `spikeFlag`, and `persistenceFlag` with exactly those names and
 * types — so a `SymptomState` can be passed straight into
 * `recommendStrengthTarget` without any adapter.
 *
 * This test doesn't assert behavior; it asserts *assignability*. If a future
 * rename or restructuring of `StreamState` drops or renames one of these
 * fields, this line stops compiling and `tsc`/`npm run typecheck` fails —
 * catching the decoupling at build time instead of silently at runtime.
 */
describe('structural compatibility with RecommendationSymptomState', () => {
  it('lets an evaluateSymptoms result be assigned to a RecommendationSymptomState', () => {
    const logs: SymptomLog[] = [
      { id: 'sym_1', forDate: '2026-08-31', shinPain: 1, sciaticPain: 0, sessionRpe: 6, notes: '', loggedAt: '2026-08-31T18:00:00.000Z' },
    ]
    const state: RecommendationSymptomState = evaluateSymptoms(logs, '2026-09-01')
    expect(state.shin.level).toBe('green')
  })
})
