import { SIGN_IN_WINDOW_MINUTES } from '@/lib/schemas/constants'

/** The `code` a sign-in refused by its rate limit carries (auth/sign-in-limit.ts). */
export const TOO_MANY_SIGN_INS = 'too_many_attempts'

/**
 * The `code` a suspended account's sign-in carries, after a correct password
 * (decision 0018; phase 14, item 1.15).
 */
export const SUSPENDED_SIGN_IN = 'suspended'

/**
 * The `code` a Google sign-in refused because the account turned Google off
 * carries (phase 14, item 3.16). Said plainly: Google has already verified
 * the address, so whoever hears it is the address's owner.
 */
export const GOOGLE_SIGN_IN_OFF = 'google_off'

/**
 * FR-1.6 — what the sign-in page says when somebody is sent back to it.
 *
 * `?error=` carries the Auth.js error type and `?code=` a `CredentialsSignin`'s
 * code: the page's own action puts them there, and Auth.js does the same when
 * a Google sign-in fails. Only a refused password is the person's to fix.
 * Until 2026-10-15 every failure read "That email and password do not match",
 * so when production was missing a column the owner was told, five times
 * running, that a correct password was wrong. Until phase 14 a suspended
 * person read it too, reset their password, and read it again.
 */
export function signInErrorMessage(
  error: string | string[] | undefined,
  code?: string | string[],
  contact = 'the address on the contact page',
): string | null {
  if (error === undefined) return null
  switch (error) {
    case 'CredentialsSignin':
      if (code === TOO_MANY_SIGN_INS) {
        return `Too many sign-in attempts. Wait ${String(SIGN_IN_WINDOW_MINUTES)} minutes and try again.`
      }
      if (code === SUSPENDED_SIGN_IN) {
        return `This account is suspended while reports about it are reviewed. Write to ${contact} if you think that's wrong.`
      }
      return 'That email and password do not match. Try again.'
    // `signIn` refused a Google account: unverified, suspended or deleted. Which
    // one is not said, for the reason given in `auth/index.ts`.
    case 'AccessDenied':
      if (code === GOOGLE_SIGN_IN_OFF) {
        return 'Google sign-in is turned off for this account. Sign in with your password, and turn it back on in settings if you want it.'
      }
      return 'That Google account cannot be used to sign in here.'
    default:
      return 'We could not sign you in just now. That is a fault on our side, not your password. Try again in a minute.'
  }
}
