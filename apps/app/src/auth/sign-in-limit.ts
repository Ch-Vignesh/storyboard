import 'server-only'

import type { PrismaClient } from '@storyboard/db'

import { AUTH_LIMITS, SIGN_IN_WINDOW_MINUTES } from '@/lib/schemas/constants'
import { MINUTE_MS, consume, key } from '@/server/limits'

/**
 * FR-13.3 for sign-in, which had no limit at all until the phase 12 audit: a
 * script could guess one person's password for as long as it liked, and every
 * guess cost the server an Argon2 hash.
 *
 * Two counts, both before the password is checked. An address from one client
 * is the one that stops guessing at a person; keying it on the client as well
 * means a stranger cannot lock the real owner out from their own device. One
 * client across every address is the one that stops a list being worked
 * through. Without a client address (run locally, no edge in front) the
 * address count still applies and the client count is skipped.
 */
export async function signInAllowed(
  db: PrismaClient,
  email: string,
  client: string | null,
): Promise<boolean> {
  const windowMs = SIGN_IN_WINDOW_MINUTES * MINUTE_MS
  if (client) {
    const fromClient = await consume(db, key.signInsFrom(client), {
      limit: AUTH_LIMITS.signInsPerClient,
      windowMs,
    })
    if (!fromClient.ok) return false
  }
  const forAddress = await consume(db, key.signIn(email, client ?? 'unknown'), {
    limit: AUTH_LIMITS.signInsPerAddressAndClient,
    windowMs,
  })
  return forAddress.ok
}
