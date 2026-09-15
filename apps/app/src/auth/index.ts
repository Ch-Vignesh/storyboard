import { prisma } from '@storyboard/db'
import NextAuth, { type NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'

import { env } from '@/env'
import { credentialsSchema } from '@/lib/schemas/auth'

import { authConfig } from './config'
import { googleConfigured, resolveGoogleUser, type GoogleProfile } from './google'
import { hashPassword, verifyPassword } from './password'

// Verified against when the email is unknown, so both outcomes take about the
// same time and a caller cannot tell registered addresses from unregistered ones.
let decoyHash: Promise<string> | undefined
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword('decoy-password-never-accepted')
  return decoyHash
}

/**
 * FR-1.6 — the Google provider, registered only when it is configured.
 *
 * `allowDangerousEmailAccountLinking` is **not** set, and the name is doing its
 * job: it would tell Auth.js to link an OAuth identity to an existing account
 * on email alone, whether or not the provider checked the address. The linking
 * this product does is in `resolveGoogleUser`, which refuses unless Google has
 * asserted `email_verified` — the same outcome for the safe case, and a refusal
 * rather than a takeover for the unsafe one.
 */
const googleProvider = googleConfigured()
  ? [
      Google({
        clientId: String(env.AUTH_GOOGLE_ID),
        clientSecret: String(env.AUTH_GOOGLE_SECRET),
        // Only what is needed to identify somebody. No contacts, no profile
        // beyond a name, nothing this product would then have to protect.
        authorization: { params: { scope: 'openid email profile', prompt: 'select_account' } },
      }),
    ]
  : []

/**
 * The callbacks, extended for Google.
 *
 * `authConfig` stays database-free because `proxy.ts` imports it and runs on
 * every document. These two do touch the database, so they live here, where
 * only the server reaches them.
 */
const callbacks: NextAuthConfig['callbacks'] = {
  ...authConfig.callbacks,

  async signIn({ account, profile }) {
    // Credentials has already done its own checking in `authorize`.
    if (account?.provider !== 'google') return true

    const outcome = await resolveGoogleUser(profile as GoogleProfile)
    if (outcome.ok) return true

    // Auth.js turns `false` into a generic failure on the sign-in page, which
    // is the right amount to say: a message distinguishing "suspended" from
    // "no such account" would answer a question strangers should not get to ask.
    return false
  },

  async jwt(params) {
    // Synchronous, and left un-awaited on purpose: `authConfig` is the
    // database-free half that `proxy.ts` runs on the edge, and nothing in it
    // should become asynchronous without somebody noticing here.
    const token = authConfig.callbacks.jwt(params)

    // A Google sign-in hands us a profile, not one of our rows, so the token
    // has to be filled from the account `signIn` just resolved. Credentials
    // does this in `authorize`, where the row is already in hand.
    if (params.account?.provider === 'google') {
      const outcome = await resolveGoogleUser(params.profile as GoogleProfile)
      if (outcome.ok) {
        token.id = outcome.userId
        token.username = outcome.username
        token.onboarded = outcome.onboarded
      }
    }

    return token
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks,
  providers: [
    ...googleProvider,
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null
        const { email, password } = parsed.data

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.passwordHash || !user.emailVerifiedAt || user.status !== 'ACTIVE') {
          await verifyPassword(await getDecoyHash(), password)
          return null
        }
        if (!(await verifyPassword(user.passwordHash, password))) return null

        return {
          id: user.id,
          email: user.email,
          name: user.displayName ?? user.username ?? undefined,
          username: user.username,
          onboarded: user.onboardedAt !== null,
        }
      },
    }),
  ],
})
