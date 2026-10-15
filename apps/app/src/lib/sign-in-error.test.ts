import { describe, expect, it } from 'vitest'

import { signInErrorMessage } from './sign-in-error'

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

  it('does not tell a Google sign-in its password was wrong', () => {
    expect(signInErrorMessage('AccessDenied')).not.toMatch(/password/u)
  })

  it('says nothing when nothing went wrong', () => {
    expect(signInErrorMessage(undefined)).toBeNull()
  })
})
