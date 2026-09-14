import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { hashPassword } from '@/auth/password'
import { createVerificationToken, hashToken, isWithinResendCooldown } from '@/auth/tokens'
import { env } from '@/env'
import { logger } from '@/lib/logger'
import { emailSchema, passwordSchema } from '@/lib/schemas/auth'
import { getMailer } from '@/server/mail/mailer'
import { verifyEmailMail } from '@/server/mail/templates/verify-email'

import { type Context, createTRPCRouter, publicProcedure } from '../init'

const tokenInput = z.object({ token: z.string().min(20).max(200) })

/** Issue a fresh verification link unless one was issued in the last minute (FR-1.4). */
async function issueVerification(db: Context['db'], user: { id: string; email: string }) {
  const latest = await db.emailVerificationToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (isWithinResendCooldown(latest?.createdAt)) return 'cooldown' as const

  const { token, tokenHash, expiresAt } = createVerificationToken()
  await db.emailVerificationToken.create({ data: { userId: user.id, tokenHash, expiresAt } })
  const url = `${env.NEXT_PUBLIC_APP_URL}/verify?token=${token}`
  await getMailer().send(verifyEmailMail({ to: user.email, url }))
  logger.info({ event: 'auth.verification.sent', userId: user.id }, 'verification email sent')
  return 'sent' as const
}

function findLiveToken(db: Context['db'], token: string) {
  return db.emailVerificationToken.findFirst({
    where: { tokenHash: hashToken(token), consumedAt: null, expiresAt: { gt: new Date() } },
    include: {
      user: { select: { id: true, email: true, emailVerifiedAt: true, passwordHash: true } },
    },
  })
}

const expiredLink = () =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: 'This link has expired or was already used. Request a new one.',
  })

export const authRouter = createTRPCRouter({
  /** FR-1.3 step one: email in, verification link out. Never reveals whether the address exists. */
  signUp: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({ where: { email: input.email } })
      if (existing?.emailVerifiedAt) {
        logger.info({ event: 'auth.signup.existing' }, 'sign-up attempted for a verified address')
        return { status: 'sent' as const }
      }
      const user = existing ?? (await ctx.db.user.create({ data: { email: input.email } }))
      return { status: await issueVerification(ctx.db, user) }
    }),

  /** FR-1.4: re-sendable with a 60-second cooldown. */
  resendVerification: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { email: input.email } })
      if (!user || user.emailVerifiedAt) return { status: 'sent' as const }
      return { status: await issueVerification(ctx.db, user) }
    }),

  /** Checks a link without consuming it, so the set-password screen can render. */
  verifyEmail: publicProcedure.input(tokenInput).query(async ({ ctx, input }) => {
    const record = await findLiveToken(ctx.db, input.token)
    if (!record) throw expiredLink()
    return { email: record.user.email }
  }),

  /** FR-1.3 step two: consumes the link, marks the email verified and stores the password. */
  setPassword: publicProcedure
    .input(tokenInput.extend({ password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      const record = await findLiveToken(ctx.db, input.token)
      if (!record) throw expiredLink()
      const passwordHash = await hashPassword(input.password)
      await ctx.db.$transaction([
        ctx.db.emailVerificationToken.update({
          where: { id: record.id },
          data: { consumedAt: new Date() },
        }),
        ctx.db.user.update({
          where: { id: record.user.id },
          data: { passwordHash, emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
        }),
      ])
      logger.info({ event: 'auth.password.set', userId: record.user.id }, 'password set')
      return { email: record.user.email }
    }),
})
