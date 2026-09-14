import { prisma } from '@storyboard/db'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

import { credentialsSchema } from '@/lib/schemas/auth'

import { authConfig } from './config'
import { hashPassword, verifyPassword } from './password'

// Verified against when the email is unknown, so both outcomes take about the
// same time and a caller cannot tell registered addresses from unregistered ones.
let decoyHash: Promise<string> | undefined
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword('decoy-password-never-accepted')
  return decoyHash
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
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
