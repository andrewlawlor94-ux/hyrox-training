/**
 * The three-question screen offered only when `SymptomState.needsRedFlagScreen`
 * is true (sciatic ≥ 5 or the sciatic stream is flagged — see evaluate.ts).
 * These are the classic cauda-equina / progressive-neurological screening
 * questions, phrased in plain language for an athlete, not a clinician —
 * this module never names a condition, it only routes to urgent care.
 */
export const RED_FLAG_QUESTIONS: { id: string; label: string }[] = [
  { id: 'bowelBladder', label: 'Have you noticed any new difficulty controlling your bowels or bladder?' },
  { id: 'saddleNumbness', label: 'Do you have new numbness or altered sensation around your groin, buttocks, or inner thighs?' },
  { id: 'progressiveWeakness', label: 'Is weakness in your leg or foot getting worse, or making it hard to walk normally?' },
]

export interface RedFlagAnswers {
  bowelBladder: boolean
  saddleNumbness: boolean
  progressiveWeakness: boolean
}

/** True if any single answer is yes — any one of these three warrants urgent
 * assessment on its own; they are not meant to be weighed against each other. */
export function hasUrgentRedFlag(answers: RedFlagAnswers): boolean {
  return answers.bowelBladder || answers.saddleNumbness || answers.progressiveWeakness
}

/**
 * Safety-prompt copy shown when `hasUrgentRedFlag` is true. Deliberately
 * names no condition and makes no diagnosis — it only tells the athlete what
 * to do right now.
 *
 * For this specific combination of answers (new bowel/bladder dysfunction,
 * saddle numbness, or significant progressive weakness), same-day emergency
 * assessment is the appropriate steer — not one option alongside a routine
 * doctor's visit. The copy makes that the unambiguous recommendation and
 * explicitly tells the athlete not to wait for a routine appointment, so it
 * cannot be read as "book a GP visit whenever is convenient."
 */
export function urgentRedFlagMessage(): string {
  return 'Stop training now. This combination of symptoms needs same-day medical attention — go to an emergency department or urgent care centre, or call emergency services, today. Please do not wait for a routine doctor\'s appointment. This is a safety prompt to get you seen quickly, not a diagnosis or a judgment about what is causing your symptoms.'
}
