import type { FC } from 'react'

/**
 * Placeholder for Task 18 only: the router's `/onboarding` route needs a
 * real target the moment `AppShell` starts redirecting to it, but the
 * actual three-step wizard (race date, profile, goal) is Task 19's
 * deliverable in the very next commit, which replaces this file's contents
 * entirely. No interactive elements here — nothing to click, so nothing
 * that could be a "fake button" — just an honest acknowledgement of the
 * step while it's being built.
 */
export const OnboardingScreen: FC = () => (
  <div className="onboarding-screen">
    <h1 className="onboarding-screen__heading">Onboarding</h1>
    <p className="onboarding-screen__description">Setting up your race date, profile, and goal…</p>
  </div>
)
