import { describe, expect, it } from 'vitest'

import {
  GOOGLE_SIGN_IN_OFF,
  signInErrorMessage,
  SUSPENDED_SIGN_IN,
  TOO_MANY_SIGN_INS,
} from './sign-in-error'

describe('signInErrorMessage (FR-1.6)', () => {
  it('blames the password only when the password was refused', () => {
    expect(signInErrorMessage('CredentialsSignin')).toMatch(/do not match/u)
  })

  // 2026-10-15: `authorize` threw on a missing column, Auth.js reported a
  // CallbackRouteError, and the page said the password was wrong.
  it.each(['CallbackRouteError', 'Configuration', 'OAuthCallbackError', 'anything else'])(
    'says the fault is ours for %s',
    (type) => {
      const message = signInErrorMessage(type)
      expect(message).toMatch(/fault on our side/u)
      expect(message).not.toMatch(/do not match/u)
    },
  )

  it('says a refused attempt was the limit, not the password', () => {
    const message = signInErrorMessage('CredentialsSignin', TOO_MANY_SIGN_INS)
    expect(message).toMatch(/too many sign-in attempts/iu)
    expect(message).not.toMatch(/do not match/u)
  })

  it('does not tell a Google sign-in its password was wrong', () => {
    expect(signInErrorMessage('AccessDenied')).not.toMatch(/password/u)
  })

  // Decision 0018 (phase 14, item 1.15): a suspended person, after a correct
  // password, is told so and where to write; before, they read that the
  // password did not match, and a reset "worked" and was wrong again.
  it('tells a suspended account so, with somewhere to write', () => {
    const message = signInErrorMessage('CredentialsSignin', SUSPENDED_SIGN_IN, 'help@example.test')
    expect(message).toMatch(/suspended/iu)
    expect(message).toContain('help@example.test')
    expect(message).not.toMatch(/do not match/u)
  })

  it('says nothing when nothing went wrong', () => {
    expect(signInErrorMessage(undefined)).toBeNull()
  })

  // Phase 14, item 3.16 — the one Google refusal that is said plainly.
  it('tells an account that turned Google off why, and where to turn it on', () => {
    const message = signInErrorMessage('AccessDenied', GOOGLE_SIGN_IN_OFF)
    expect(message).toMatch(/turned off/u)
    expect(message).toMatch(/settings/u)
    expect(message).not.toMatch(/cannot be used/u)
  })
})
