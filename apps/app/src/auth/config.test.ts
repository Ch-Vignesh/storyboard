/**
 * FR-1.7, decision 0036 — a password reset ends every session that signed in
 * before it. The rule is small and the consequence of getting it backwards is
 * not: either nobody can stay signed in, or the reset leaves the old sessions
 * where they were, including the one the reset was for.
 */
import { describe, expect, it } from 'vitest'

import { authConfig, sessionRefused, signedInBeforeReset } from './config'

describe('which sessions a password reset ends', () => {
  const reset = new Date('2026-10-15T12:00:00Z')

  it('ends none on an account that has never been reset', () => {
    expect(signedInBeforeReset(Date.parse('2020-01-01T00:00:00Z'), null)).toBe(false)
    expect(signedInBeforeReset(undefined, null)).toBe(false)
  })

  it('ends a session that signed in before the reset', () => {
    expect(signedInBeforeReset(reset.getTime() - 1, reset)).toBe(true)
  })

  it('keeps one that signed in after it — the person signing in with the new password', () => {
    expect(signedInBeforeReset(reset.getTime() + 1, reset)).toBe(false)
  })

  it('ends one from before sign-in times were recorded, once the account has been reset', () => {
    expect(signedInBeforeReset(undefined, reset)).toBe(true)
    expect(signedInBeforeReset('not a time', reset)).toBe(true)
  })

  it('records the sign-in time in the token at sign-in, and keeps it as the token is reused', () => {
    const before = Date.now()
    const signedIn = authConfig.callbacks.jwt({
      token: {},
      user: { id: 'user-1', username: 'someone', onboarded: true },
    })
    expect(typeof signedIn.authAt).toBe('number')
    expect(signedIn.authAt).toBeGreaterThanOrEqual(before)

    const later = authConfig.callbacks.jwt({ token: { ...signedIn } } as never)
    expect(later.authAt).toBe(signedIn.authAt)
  })

  // Phase 12 audit: `update()` copied whatever the browser sent, so anyone
  // could mark themselves onboarded, with any username, and skip onboarding.
  it('takes nothing about onboarding from what the browser sends', () => {
    const token = { id: 'user-1', username: null, onboarded: false }
    const after = authConfig.callbacks.jwt({
      token: { ...token },
      trigger: 'update',
      session: { username: 'somebody-else', onboarded: true },
    } as never)
    expect(after.username).toBeNull()
    expect(after.onboarded).toBe(false)
  })
})

/** Phase 14, item 3.3 — the whole rule: a reset, a sign-out everywhere, or simple age. */
describe('sessionRefused', () => {
  const day = 24 * 60 * 60 * 1000
  const now = Date.parse('2026-10-18T12:00:00Z')
  const fresh = { passwordChangedAt: null, sessionsEndedAt: null }

  it('honours a session younger than the absolute age with nothing ended', () => {
    expect(sessionRefused(now - day, fresh, now)).toBe(false)
    expect(sessionRefused(now - 29 * day, fresh, now)).toBe(false)
  })

  it('ends every session older than the absolute age, however active (D-15)', () => {
    expect(sessionRefused(now - 31 * day, fresh, now)).toBe(true)
    // No `authAt` at all is the oldest possible session.
    expect(sessionRefused(undefined, fresh, now)).toBe(true)
  })

  it('ends a session that signed in before a reset, or before a sign-out everywhere', () => {
    const ended = new Date(now - day)
    expect(sessionRefused(now - 2 * day, { ...fresh, sessionsEndedAt: ended }, now)).toBe(true)
    expect(sessionRefused(now - 2 * day, { ...fresh, passwordChangedAt: ended }, now)).toBe(true)
    // ...and keeps one that signed in after it.
    expect(sessionRefused(now - 60_000, { ...fresh, sessionsEndedAt: ended }, now)).toBe(false)
  })
})
