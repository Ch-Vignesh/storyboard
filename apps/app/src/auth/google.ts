import { prisma } from '@storyboard/db'

import { env } from '@/env'
import { isOn } from '@/lib/flags'
import { logger } from '@/lib/logger'
import { displayNameSchema } from '@/lib/schemas/profile'

/**
 * Signing in with Google (FR-1.6).
 *
 * The SRS defers OAuth and says not to build the abstraction for it early. This
 * is one provider and no abstraction: a second one would touch this file and
 * nothing else, and pretending otherwise would be the thing the SRS warns
 * against. It is inert until `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set,
 * so a clone of this repository runs without a Google project and the button
 * simply is not there.
 *
 * **Linking is by verified email, and that is a security decision.** Matching
 * an OAuth identity to an existing account by email address is an
 * account-takeover vector when the provider does not check that the person owns
 * the address — anyone can claim `someone@example.com` at a careless provider
 * and inherit their account. Google does check, and says so in the token as
 * `email_verified`. So the rule is: link only when Google asserts it, and
 * refuse the sign-in otherwise rather than silently creating a second account.
 *
 * No `Account` table and no adapter. Sessions here are JWTs (decision 0002) and
 * the only thing this needs to persist is the `User` row it already has. A
 * person who signed up through Google has no password, so the credentials
 * provider refuses them by the check it already makes.
 */

const log = logger.child({ module: 'auth.google' })

/**
 * A cleaned name, or nothing. Google's name can be anything a person typed
 * into their Google account, so it goes through the same rule as a name typed
 * into settings (item 3.8): one that reads as somebody else, or as nobody, is
 * dropped, and the username step fills the gap with the username.
 */
function displayNameFrom(name: string | null | undefined): string | null {
  const parsed = displayNameSchema.safeParse(name ?? '')
  return parsed.success ? parsed.data : null
}

export function googleConfigured(): boolean {
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET)
}

/** What a Google id token carries that this product cares about. */
export type GoogleProfile = {
  email?: string | null
  email_verified?: boolean | null
  name?: string | null
}

export type GoogleOutcome =
  | { ok: true; userId: string; username: string | null; onboarded: boolean }
  | { ok: false; reason: 'unverified' | 'suspended' | 'deleted' | 'disconnected' | 'paused' }

/**
 * Find or create the account behind a Google sign-in.
 *
 * Deliberately does **not** set a username: that is chosen once, is permanent,
 * and is FR-1.3's own step. A Google display name is not a username and using
 * one would hand somebody a permanent public identity they never chose. The
 * account arrives with no username, so the proxy sends them to onboarding
 * exactly as an email sign-up does.
 */
export async function resolveGoogleUser(profile: GoogleProfile): Promise<GoogleOutcome> {
  const email = profile.email?.trim().toLowerCase()

  // No verified address, no sign-in. See the note above: this is the whole of
  // what makes linking by email safe.
  if (!email || profile.email_verified !== true) {
    log.warn({ event: 'auth.google.unverified' }, 'Google did not assert a verified address')
    return { ok: false, reason: 'unverified' }
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      username: true,
      onboardedAt: true,
      status: true,
      emailVerifiedAt: true,
      googleLinkedAt: true,
      googleDisconnectedAt: true,
    },
  })

  if (existing) {
    if (existing.status === 'SUSPENDED') return { ok: false, reason: 'suspended' }
    if (existing.status === 'DELETED') return { ok: false, reason: 'deleted' }
    // Item 3.16 — the person turned this way in off, from settings, signed in
    // with their password. Linking by email alone would undo that here.
    if (existing.googleDisconnectedAt) {
      log.info({ event: 'auth.google.disconnected', userId: existing.id }, 'Google sign-in is off')
      return { ok: false, reason: 'disconnected' }
    }
    // Item 3.16 — remembered, so settings can say Google is a way in.
    if (!existing.googleLinkedAt) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { googleLinkedAt: new Date() },
      })
    }

    // A sign-up that was never confirmed, now confirmed by Google. Without
    // this the address went on receiving "choose a password" links for an
    // account already in use (phase 12 audit).
    if (!existing.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { emailVerifiedAt: new Date() },
      })
      await prisma.emailVerificationToken.updateMany({
        where: { userId: existing.id, consumedAt: null },
        data: { consumedAt: new Date() },
      })
    }

    // An account inside its deletion grace period signs in on purpose
    // (decision 0024) — that is how somebody stops a deletion they did not ask
    // for. `can()` and `activeProcedure` keep them from writing meanwhile.
    return {
      ok: true,
      userId: existing.id,
      username: existing.username,
      onboarded: existing.onboardedAt !== null,
    }
  }

  // Item 9.4 (D-18) — a first Google sign-in is a sign-up, and pausing
  // sign-ups pauses it too. Asked only here, after the lookup: somebody who
  // already has an account signs in as usual.
  if (await isOn('pause-sign-ups')) {
    log.info({ event: 'auth.google.paused' }, 'new account refused while sign-ups are paused')
    return { ok: false, reason: 'paused' }
  }

  const created = await prisma.user.create({
    data: {
      email,
      // Google has already done what the verification email exists to do.
      emailVerifiedAt: new Date(),
      googleLinkedAt: new Date(),
      // Item 2.3 — the button that produced this sign-in said "By continuing
      // you agree to the terms and the privacy policy". The rules are read on
      // the last onboarding step (FR-13.4).
      termsAcceptedAt: new Date(),
      // A name to show, changeable in settings. Not a username. `??` will not
      // do here: Google can send an empty string, and that should be no name
      // rather than a name that is nothing.
      displayName: displayNameFrom(profile.name),
    },
    select: { id: true },
  })

  log.info({ event: 'auth.google.created', userId: created.id }, 'account created from Google')
  return { ok: true, userId: created.id, username: null, onboarded: false }
}
