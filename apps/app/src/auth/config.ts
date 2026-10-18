import type { NextAuthConfig } from 'next-auth'

import { SESSION } from '@/lib/schemas/constants'

/**
 * The part of the Auth.js configuration that never touches the database. It is
 * imported by `proxy.ts`, which runs on every matched request. The Credentials
 * provider, which does query the database, is added in ./index.ts.
 */
export const authConfig = {
  session: { strategy: 'jwt', maxAge: SESSION.slidingDays * 24 * 60 * 60 },
  pages: { signIn: '/signin' },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user)
    },
    jwt({ token, user }) {
      // `user` is only present on sign-in; copy what the session needs into the token.
      if (user) {
        token.id = user.id
        token.username = user.username ?? null
        token.onboarded = user.onboarded ?? false
        // When this session signed in (decision 0036). Not `iat`: Auth.js
        // re-issues the token as it is used, and `iat` moves with it, so it
        // says when the cookie was last written rather than when anybody
        // proved who they were. A claim of our own is copied unchanged.
        token.authAt = Date.now()
      }
      // Onboarding steps 3 and 4 change facts the token carries, and the
      // client calls `update()` after each. What it sends is ignored: the
      // server half (`auth/index.ts`) reads them from the database on every
      // request, `update()` included. Copying the client's values let anyone
      // mark themselves onboarded with no username (phase 12 audit).
      return token
    },
    session({ session, token }) {
      // The token is a Record<string, unknown>; read it defensively rather than
      // augmenting @auth/core's JWT type through a transitive dependency.
      session.user.id = asString(token.id) ?? token.sub ?? ''
      session.user.username = asString(token.username)
      session.user.onboarded = token.onboarded === true
      // Item 3.2 — when this session signed in, for the few things that want
      // a recent one.
      session.authAt = typeof token.authAt === 'number' ? token.authAt : undefined
      return session
    },
  },
} satisfies NextAuthConfig

/**
 * FR-1.7, decision 0036 — whether a session signed in before the account's
 * password was last reset, and so must not be honoured any more. A token from
 * before `authAt` existed counts as the oldest possible, which matters only on
 * an account that has been reset since.
 */
export function signedInBeforeReset(authAt: unknown, passwordChangedAt: Date | null): boolean {
  if (!passwordChangedAt) return false
  const signedIn = typeof authAt === 'number' ? authAt : 0
  return signedIn < passwordChangedAt.getTime()
}

/**
 * Phase 14, item 3.3 — the whole rule for whether a session is over: it signed
 * in before the later of a password reset (decision 0036) and "Sign out on
 * every device", or it is older than `SESSION.absoluteDays` (D-15), however
 * active it has been. Read on every request from the one row the session
 * callback loads anyway.
 */
export function sessionRefused(
  authAt: unknown,
  account: { passwordChangedAt: Date | null; sessionsEndedAt: Date | null },
  now: number = Date.now(),
): boolean {
  const signedIn = typeof authAt === 'number' ? authAt : 0
  if (
    signedInBeforeReset(authAt, account.passwordChangedAt) ||
    signedInBeforeReset(authAt, account.sessionsEndedAt)
  ) {
    return true
  }
  return now - signedIn > SESSION.absoluteDays * 24 * 60 * 60 * 1000
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
