import { SIGN_IN_WINDOW_MINUTES } from '@/lib/schemas/constants'

/** The `code` a sign-in refused by its rate limit carries (auth/sign-in-limit.ts). */
export const TOO_MANY_SIGN_INS = 'too_many_attempts'

/**
 * FR-1.6 — what the sign-in page says when somebody is sent back to it.
 *
 * `?error=` carries the Auth.js error type and `?code=` a `CredentialsSignin`'s
 * code: the page's own action puts them there, and Auth.js does the same when
 * a Google sign-in fails. Only a refused password is the person's to fix.
 * Until 2026-10-15 every failure read "That email and password do not match",
 * so when production was missing a column the owner was told, five times
 * running, that a correct password was wrong.
 */
export function signInErrorMessage(
  error: string | string[] | undefined,
  code?: string | string[],
): string | null {
  if (error === undefined) return null
  switch (error) {
    case 'CredentialsSignin':
      return code === TOO_MANY_SIGN_INS
        ? `Too many sign-in attempts. Wait ${String(SIGN_IN_WINDOW_MINUTES)} minutes and try again.`
        : 'That email and password do not match. Try again.'
    // `signIn` refused a Google account: unverified, suspended or deleted. Which
    // one is not said, for the reason given in `auth/index.ts`.
    case 'AccessDenied':
      return 'That Google account cannot be used to sign in here.'
    default:
      return 'We could not sign you in just now. That is a fault on our side, not your password. Try again in a minute.'
  }
}
