/**
 * The limiter's vocabulary, in a file of its own.
 *
 * Only so that a driver (`redis.ts`) and the dispatcher that chooses it
 * (`index.ts`) can share these without importing each other. No `server-only`
 * guard here: there is nothing to guard, and adding one would stop the types
 * being referenced from anywhere that happens to be compiled for the browser.
 */

export type Limit = {
  /** How many are allowed inside the window. */
  limit: number
  /** How long the window is, in milliseconds. */
  windowMs: number
}

export type Verdict = {
  ok: boolean
  /** How many remain after this one. Zero when refused. */
  remaining: number
  /** When the oldest hit in the window falls out of it, if refused. */
  retryAt: Date | null
}
