import type { PrismaClient } from '@storyboard/db'
import { CredentialsSignin } from 'next-auth'

import { credentialsSchema } from '@/lib/schemas/auth'
import { SUSPENDED_SIGN_IN, TOO_MANY_SIGN_INS } from '@/lib/sign-in-error'
import { clientAddress } from '@/server/client-address'

import { hashPassword, verifyPassword } from './password'
import { signInAllowed } from './sign-in-limit'

/** A sign-in refused by its limit, not by its password. Its `code` reaches the page. */
export class TooManyAttempts extends CredentialsSignin {
  override code = TOO_MANY_SIGN_INS
}

/**
 * Decision 0018 (phase 14, item 1.15) — a suspended account, after a correct
 * password. Its `code` reaches the page, which says where to write.
 */
export class SuspendedSignIn extends CredentialsSignin {
  override code = SUSPENDED_SIGN_IN
}

// Verified against when the email is unknown, or the account cannot sign in,
// so every refusal takes about the same time and a caller cannot tell
// registered addresses from unregistered ones.
let decoyHash: Promise<string> | undefined
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword('decoy-password-never-accepted')
  return decoyHash
}

export type SignedIn = {
  id: string
  email: string
  name: string | undefined
  username: string | null
  onboarded: boolean
}

/**
 * The credentials provider's `authorize`, out here so it can be tested without
 * Auth.js around it (item 1.15).
 *
 * The order matters. The limit first, so a refused attempt costs nothing.
 * Then the password, for any account that has one, whatever its status: a
 * wrong password is always "do not match". Only a *correct* password on a
 * suspended account is told of the suspension (decision 0018). Told before
 * the password, the suspension would be readable by anyone with the address;
 * refused before it, as it was, the person read "do not match", reset the
 * password, and read it again.
 */
export async function authorizeCredentials(
  db: PrismaClient,
  raw: unknown,
  headers: Headers,
): Promise<SignedIn | null> {
  const parsed = credentialsSchema.safeParse(raw)
  if (!parsed.success) return null
  const { email, password } = parsed.data

  if (!(await signInAllowed(db, email, clientAddress(headers)))) {
    throw new TooManyAttempts()
  }

  const user = await db.user.findUnique({ where: { email } })
  // No account, no password yet, an unconfirmed address, or an erased account:
  // the decoy's cost, then nothing.
  if (!user?.passwordHash || !user.emailVerifiedAt || user.status === 'DELETED') {
    await verifyPassword(await getDecoyHash(), password)
    return null
  }
  if (!(await verifyPassword(user.passwordHash, password))) return null
  if (user.status !== 'ACTIVE') throw new SuspendedSignIn()

  return {
    id: user.id,
    email: user.email,
    name: user.displayName ?? user.username ?? undefined,
    username: user.username,
    onboarded: user.onboardedAt !== null,
  }
}
