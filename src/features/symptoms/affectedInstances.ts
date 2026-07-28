import type { RecoveryTag, SymptomStream, WorkoutInstance, WorkoutStatus } from '@/data/types'
import type { Substitution } from '@/domain/symptoms/substitutions'

/** Which `RecoveryTag`s make an instance "affected" by a given symptom
 * stream — a shin-flagged suggestion only makes sense against running/
 * high-impact work; a sciatic-flagged one against running or lower-body
 * loading. Deliberately feature-layer (not domain): it is a UI matching
 * decision about which upcoming sessions to surface a card against, not a
 * clinical rule. */
const AFFECTED_TAGS: Record<SymptomStream, readonly RecoveryTag[]> = {
  shin: ['hardRun', 'easyRun', 'longRun', 'highImpactStation'],
  sciatic: ['hardRun', 'lowerBodyStrength', 'highImpactStation'],
}

/** Statuses still ahead of the athlete — a card never appears against
 * history that already happened, and never counts as auto-cancelling
 * anything since it never touches `status` at all. */
const SCHEDULABLE_STATUSES: readonly WorkoutStatus[] = ['upcoming', 'available', 'inProgress']

export interface AffectedInstance {
  instance: WorkoutInstance
  substitution: Substitution
}

/**
 * Pairs each still-scheduled instance with every `Substitution` whose stream
 * matches one of its `recoveryTags`, skipping any pair already dismissed for
 * THAT instance (dismissal keys are `${instanceId}:${kind}`, so dismissing
 * for one instance never suppresses the same suggestion on a different
 * affected instance).
 */
export function affectedInstances(
  instances: WorkoutInstance[], substitutions: Substitution[], dismissedSubstitutions: readonly string[],
): AffectedInstance[] {
  const out: AffectedInstance[] = []
  for (const instance of instances) {
    if (!SCHEDULABLE_STATUSES.includes(instance.status)) continue
    for (const substitution of substitutions) {
      const tags = AFFECTED_TAGS[substitution.stream]
      if (!instance.recoveryTags.some((tag) => tags.includes(tag))) continue
      if (dismissedSubstitutions.includes(`${instance.id}:${substitution.kind}`)) continue
      out.push({ instance, substitution })
    }
  }
  return out
}
