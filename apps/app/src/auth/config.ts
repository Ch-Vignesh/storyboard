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
