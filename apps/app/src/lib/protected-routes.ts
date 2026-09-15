/**
 * Which paths need a session (FR-1.2, FR-1.3).
 *
 * This was the proxy's `matcher` until phase 9, when the Content-Security-Policy
 * needed the proxy to run on every document instead. The list did not change —
 * it moved here, and the proxy now consults it rather than being configured by
 * it.
 *
 * That move is the kind that quietly widens a gate: a mistake here does not
 * fail loudly, it makes a public page ask for a password, or a private one stop
 * asking. Hence a file of its own, importable without booting Auth.js, and a
 * test that reads like the requirement.
 */

/**
 * Reading a storyboard is deliberately absent: a guest may read a public one
 * (FR-1.2), and `lib/authz` decides the rest at the data layer (NFR-6).
 */
export const NEEDS_AN_ACCOUNT: readonly RegExp[] = [
  /^\/$/u,
  /^\/onboarding(?:\/|$)/u,
  /^\/new$/u,
  /^\/notifications$/u,
  /^\/settings(?:\/|$)/u,
  /^\/import(?:\/|$)/u,
  /^\/admin(?:\/|$)/u,
  // Writing surfaces inside a storyboard.
  /^\/s\/[^/]+\/c\/.+\/edit$/u,
  /^\/s\/[^/]+\/help\/new$/u,
  /^\/s\/[^/]+\/help\/[^/]+\/write$/u,
  /^\/s\/[^/]+\/settings(?:\/|$)/u,
]

export function needsAnAccount(pathname: string): boolean {
  return NEEDS_AN_ACCOUNT.some((route) => route.test(pathname))
}
