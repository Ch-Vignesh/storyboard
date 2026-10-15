/**
 * FR-1.7, decision 0036 — a password reset ends every session that signed in
 * before it. The rule is small and the consequence of getting it backwards is
 * not: either nobody can stay signed in, or the reset leaves the old sessions
 * where they were, including the one the reset was for.
 */
import { describe, expect, it } from 'vitest'

import { authConfig, signedInBeforeReset } from './config'

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
})
