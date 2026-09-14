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
    jwt({ token, user, trigger, session }) {
      // `user` is only present on sign-in; copy what the session needs into the token.
      if (user) {
        token.id = user.id
        token.username = user.username ?? null
        token.onboarded = user.onboarded ?? false
      }
      // Onboarding steps 3 and 4 change facts the token carries. Without this
      // the proxy would keep redirecting a user who has just finished, until
      // their token expired. The client calls `update()` after each step.
      if (trigger === 'update' && session && typeof session === 'object') {
        const patch = session as { username?: unknown; onboarded?: unknown }
        if (typeof patch.username === 'string') token.username = patch.username
        if (typeof patch.onboarded === 'boolean') token.onboarded = patch.onboarded
      }
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

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
