import type { NextAuthConfig } from 'next-auth'

/**
 * The part of the Auth.js configuration that never touches the database. It is
 * imported by `proxy.ts`, which runs on every matched request. The Credentials
 * provider, which does query the database, is added in ./index.ts.
 */
export const authConfig = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
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

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
