import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { hashPassword } from '@/auth/password'
import {
  VERIFICATION_RESEND_COOLDOWN_MS,
  createPasswordResetToken,
  createVerificationToken,
  hashToken,
  isWithinResendCooldown,
} from '@/auth/tokens'
import { env } from '@/env'
import { logger } from '@/lib/logger'
import { emailSchema, passwordSchema } from '@/lib/schemas/auth'
import { afterResponse } from '@/server/after-response'
import { getMailer } from '@/server/mail/mailer'
import { accountExistsMail } from '@/server/mail/templates/account-exists'
import { passwordChangedMail } from '@/server/mail/templates/password-changed'
import { passwordResetMail } from '@/server/mail/templates/password-reset'
import { verifyEmailMail } from '@/server/mail/templates/verify-email'

import { AUTH_LIMITS } from '@/lib/schemas/constants'
import { DAY_MS, HOUR_MS, consume, enforce, key, whenToRetry } from '@/server/limits'

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
  // Resolved here, in the request: a half-configured provider throws, and that
  // has to surface as an error now rather than vanish after the response.
  const mailer = getMailer()
  // After the response (phase 10): Gmail can take many seconds to accept a
  // message, and the form only needs to know the link exists. A failed send is
  // logged, and the page already offers another link.
  await afterResponse(async () => {
    try {
      await mailer.send(verifyEmailMail({ to: user.email, url }))
      logger.info({ event: 'auth.verification.sent', userId: user.id }, 'verification email sent')
    } catch (error) {
      logger.error(
        { event: 'auth.verification.failed', userId: user.id, error: String(error) },
        'verification email not sent',
      )
    }
  })
  return 'sent' as const
}

/**
 * FR-1.4's one-minute rhythm, for an address with no link to issue: one that
 * already has an account, or none at all.
 *
 * An address waiting for its link answers "cooldown" when asked twice inside a
 * minute, because `issueVerification` says so. Every other address used to
 * answer "sent" every time, so two requests told a stranger which kind an
 * address was. This gives them the same rhythm. It records a hit when it lets
 * one through, so the second request inside the minute is the one refused.
 */
async function inQuietCooldown(db: Context['db'], cooldownKey: string): Promise<boolean> {
  const verdict = await consume(db, cooldownKey, {
    limit: 1,
    windowMs: VERIFICATION_RESEND_COOLDOWN_MS,
  })
  return !verdict.ok
}

/**
 * The same answer for an address that already has an account (FR-1.3), and a
 * note to it saying so — the only place the owner, and only the owner, can
 * read that. Before the note, they were told a link was on its way and nothing
 * came (2026-10-15, the first sign-up attempt on production).
 */
async function noticeExistingAccount(db: Context['db'], user: { id: string; email: string }) {
  if (await inQuietCooldown(db, key.addressCooldown(user.email))) return 'cooldown' as const

  const mailer = getMailer()
  // After the response, like the verification email, so neither path is the
  // slower one: the time an answer takes must not say which kind it was.
  await afterResponse(async () => {
    try {
      await mailer.send(
        accountExistsMail({
          to: user.email,
          signInUrl: `${env.NEXT_PUBLIC_APP_URL}/signin`,
          forgotUrl: `${env.NEXT_PUBLIC_APP_URL}/forgot-password`,
        }),
      )
      logger.info(
        { event: 'auth.signup.existing.notified', userId: user.id },
        'account-exists note sent',
      )
    } catch (error) {
      logger.error(
        { event: 'auth.signup.existing.failed', userId: user.id, error: String(error) },
        'account-exists note not sent',
      )
    }
  })
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

/** FR-1.7 — a reset link for an account that has a password to reset. */
async function issuePasswordReset(db: Context['db'], user: { id: string; email: string }) {
  const { token, tokenHash, expiresAt } = createPasswordResetToken()
  await db.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } })
  const url = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`
  const mailer = getMailer()
  // After the response, as every other auth email: the time the answer takes
  // must not say whether the address had an account.
  await afterResponse(async () => {
    try {
      await mailer.send(passwordResetMail({ to: user.email, url }))
      logger.info({ event: 'auth.reset.sent', userId: user.id }, 'password reset link sent')
    } catch (error) {
      logger.error(
        { event: 'auth.reset.failed', userId: user.id, error: String(error) },
        'password reset link not sent',
      )
    }
  })
}

function findLiveResetToken(db: Context['db'], token: string) {
  return db.passwordResetToken.findFirst({
    where: { tokenHash: hashToken(token), consumedAt: null, expiresAt: { gt: new Date() } },
    include: { user: { select: { id: true, email: true, emailVerifiedAt: true } } },
  })
}

/**
 * The reset itself, once per link. Exported for its test.
 *
 * `findLiveResetToken` has already said the link was unused, but so may a
 * second request that looked a moment earlier. The claim here is conditional
 * on the link still being unused, inside the transaction, so only one of them
 * changes the password; the other gets `false`.
 */
export async function applyPasswordReset(
  db: Context['db'],
  record: { id: string; user: { id: string; emailVerifiedAt: Date | null } },
  passwordHash: string,
  now: Date,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    })
    if (claimed.count !== 1) return false
    // Any other link still open for the account goes with it.
    await tx.passwordResetToken.updateMany({
      where: { userId: record.user.id, consumedAt: null },
      data: { consumedAt: now },
    })
    await tx.user.update({
      where: { id: record.user.id },
      data: {
        passwordHash,
        passwordChangedAt: now,
        // Opening the link proved the inbox, which is all verifying means.
        emailVerifiedAt: record.user.emailVerifiedAt ?? now,
      },
    })
    return true
  })
}

const expiredResetLink = () =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: 'This link has expired or was already used. Ask for a new one.',
  })

export const authRouter = createTRPCRouter({
  /** FR-1.3 step one: email in, verification link out. Never reveals whether the address exists. */
  signUp: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      // Keyed on the address rather than the person: there is no person yet.
      // An address is not an identity, but it is what the action is about, and
      // it is what somebody abusing this has to keep changing.
      await enforce(
        ctx.db,
        key.signUp(input.email),
        { limit: AUTH_LIMITS.signUpsPerAddress, windowMs: DAY_MS },
        () => 'That address has been used to sign up several times today.',
      )

      const existing = await ctx.db.user.findUnique({ where: { email: input.email } })
      if (existing?.emailVerifiedAt) {
        logger.info({ event: 'auth.signup.existing' }, 'sign-up attempted for a verified address')
        return { status: await noticeExistingAccount(ctx.db, existing) }
      }
      // FR-13.4 — the rules are on the screen that produced this call, so
      // this records that they were shown rather than claiming they were read.
      const user =
        existing ??
        (await ctx.db.user.create({ data: { email: input.email, rulesSeenAt: new Date() } }))
      return { status: await issueVerification(ctx.db, user) }
    }),

  /** FR-1.4: re-sendable with a 60-second cooldown. */
  resendVerification: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      // The 60-second cooldown below is about not spamming one person; this is
      // about not letting this endpoint be used to send mail all day.
      await enforce(
        ctx.db,
        key.verificationResend(input.email),
        { limit: AUTH_LIMITS.resendsPerAddress, windowMs: HOUR_MS },
        (retryAt) =>
          `That link has been sent several times already. Try again ${whenToRetry(retryAt)}.`,
      )

      const user = await ctx.db.user.findUnique({ where: { email: input.email } })
      if (user?.emailVerifiedAt) return { status: await noticeExistingAccount(ctx.db, user) }
      if (!user) {
        return {
          status: (await inQuietCooldown(ctx.db, key.addressCooldown(input.email)))
            ? 'cooldown'
            : 'sent',
        } as const
      }
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

  /**
   * FR-1.7 step one: an address in, a reset link out, if there is a password
   * to reset. The answer is the same for every address, in the same
   * one-minute rhythm, so this cannot be used to find out who has an account.
   */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      await enforce(
        ctx.db,
        key.passwordReset(input.email),
        { limit: AUTH_LIMITS.resetsPerAddress, windowMs: HOUR_MS },
        (retryAt) =>
          `A reset link has been asked for several times already. Try again ${whenToRetry(retryAt)}.`,
      )
      // Before the address is looked up, so every kind keeps the same rhythm.
      if (await inQuietCooldown(ctx.db, key.resetCooldown(input.email))) {
        return { status: 'cooldown' as const }
      }

      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
        select: { id: true, email: true, emailVerifiedAt: true },
      })
      if (!user) {
        logger.info({ event: 'auth.reset.unknown' }, 'reset asked for an address with no account')
      } else if (!user.emailVerifiedAt) {
        // They never finished signing up, so there is no password to reset.
        // What they need is the link that lets them choose one.
        await issueVerification(ctx.db, user)
      } else {
        await issuePasswordReset(ctx.db, user)
      }
      return { status: 'sent' as const }
    }),

  /** Checks a reset link without using it up, so the reset screen can render. */
  checkPasswordReset: publicProcedure.input(tokenInput).query(async ({ ctx, input }) => {
    const record = await findLiveResetToken(ctx.db, input.token)
    if (!record) throw expiredResetLink()
    return { email: record.user.email }
  }),

  /**
   * FR-1.7 step two: the new password, set once per link.
   *
   * The link is claimed inside the transaction, by a conditional update, so two
   * submissions of the same link cannot both win. Every other link still open
   * for the account is closed with it, and `passwordChangedAt` makes every
   * session that signed in before now be refused (decision 0036): the person
   * signs in again, and so would anybody who knew the old password.
   */
  resetPassword: publicProcedure
    .input(
      tokenInput
        .extend({ password: passwordSchema, confirm: z.string() })
        .refine((value) => value.password === value.confirm, {
          message: 'The two passwords do not match.',
          path: ['confirm'],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const record = await findLiveResetToken(ctx.db, input.token)
      if (!record) throw expiredResetLink()
      const passwordHash = await hashPassword(input.password)
      const now = new Date()

      if (!(await applyPasswordReset(ctx.db, record, passwordHash, now))) throw expiredResetLink()

      logger.info(
        { event: 'auth.password.reset', userId: record.user.id },
        'password reset; every earlier session is refused',
      )
      const mailer = getMailer()
      await afterResponse(async () => {
        try {
          await mailer.send(
            passwordChangedMail({
              to: record.user.email,
              forgotUrl: `${env.NEXT_PUBLIC_APP_URL}/forgot-password`,
            }),
          )
        } catch (error) {
          logger.error(
            {
              event: 'auth.password.reset.notice_failed',
              userId: record.user.id,
              error: String(error),
            },
            'password-changed notice not sent',
          )
        }
      })
      return { email: record.user.email }
    }),
})
