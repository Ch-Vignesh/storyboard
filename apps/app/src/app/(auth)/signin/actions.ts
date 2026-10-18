'use server'

import { AuthError, CredentialsSignin } from 'next-auth'

import { signIn } from '@/auth'
import { afterSignIn } from '@/lib/safe-next'
import { signInErrorMessage } from '@/lib/sign-in-error'
import { contactAddress } from '@/lib/site'

export type SignInState = { message: string | null }

/**
 * Phase 14, item 3.4 — a failed sign-in comes back to the form with its
 * message, instead of a redirect that emptied the form. A good one goes
 * through the onboarding gate (`afterSignIn`), which sends an onboarded
 * person straight on to where they were going (item 3.5).
 * `signInErrorMessage`, the rate-limit code and `next` are what they were.
 */
export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const next = formData.get('next')
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: afterSignIn(typeof next === 'string' ? next : undefined),
    })
  } catch (caught) {
    if (caught instanceof AuthError) {
      // The type, not a flag: a refused password and a database that is down
      // both arrive here, and only one of them is the person's to fix. A
      // refused password and a refused limit are both `CredentialsSignin`;
      // the code says which.
      const code = caught instanceof CredentialsSignin ? caught.code : undefined
      return { message: signInErrorMessage(caught.type, code, contactAddress()) }
    }
    // A successful sign-in redirects by throwing; that must pass through.
    throw caught
  }
  return { message: null }
}
