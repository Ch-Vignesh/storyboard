import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { hashPassword } from '@/auth/password'
import {
  VERIFICATION_RESEND_COOLDOWN_MS,
  createPasswordResetToken,
  createVerificationToken,
  hashToken,
} from '@/auth/tokens'
import { env } from '@/env'
import { logger } from '@/lib/logger'
import { maskEmail } from '@/lib/mask-email'
import { emailSchema, passwordSchema } from '@/lib/schemas/auth'
import { safeNext } from '@/lib/safe-next'
import { contactAddress } from '@/lib/site'
import { afterResponse } from '@/server/after-response'
import { getMailer } from '@/server/mail/mailer'
import { accountExistsMail } from '@/server/mail/templates/account-exists'
import { emailChangedNoticeMail } from '@/server/mail/templates/email-change'
import { passwordChangedMail } from '@/server/mail/templates/password-changed'
import { passwordResetMail } from '@/server/mail/templates/password-reset'
import { verifyEmailMail } from '@/server/mail/templates/verify-email'

import { AUTH_LIMITS } from '@/lib/schemas/constants'
import { clientAddress } from '@/server/client-address'
import { DAY_MS, HOUR_MS, consume, enforce, key, whenToRetry } from '@/server/limits'

import { type Context, createTRPCRouter, publicProcedure } from '../init'

const tokenInput = z.object({ token: z.string().min(20).max(200) })

/**
 * What every form that sends an auth email does first, in this order and
 * before the address is looked up, so nothing about the answer depends on
 * whether it has an account (FR-1.3):
 *
 * 1. a daily limit per client, whatever addresses it types. The per-address
 *    limits do nothing against a script that changes the address each time,
 *    and Gmail stops sending at about 500 a day (phase 12 audit);
 * 2. the endpoint's own limit for this address;
 * 3. the one-minute rhythm, kept the same way for every kind of address. Two
 *    families, each one key: confirmation links (sign-up and resend, FR-1.4's
 *    cooldown between links) and reset links. Until the phase 12 audit an
 *    address with an account kept the rhythm on one key and an address without
 *    one on another, so asking two forms in turn told a stranger which kind it
 *    was. Taken before the lookup, every kind now answers alike; kept as two
 *    families so that somebody who signs up and at once forgets their password
 *    is not told to wait.
 *
 * Returns `'cooldown'` when 3 says wait; 1 and 2 throw.
 */
async function beforeAuthEmail(
  ctx: Pick<Context, 'db' | 'headers'>,
  rhythm: string,
  perAddress: {
    key: string
    limit: number
    windowMs: number
    message: (retryAt: Date | null) => string
  },
): Promise<'cooldown' | null> {
  const client = clientAddress(ctx.headers)
  if (client) {
    await enforce(
      ctx.db,
      key.authEmailsFrom(client),
      { limit: AUTH_LIMITS.emailsPerClientPerDay, windowMs: DAY_MS },
      () => 'Too many emails have been asked for from here today. Try again tomorrow.',
    )
  }
  await enforce(ctx.db, perAddress.key, perAddress, perAddress.message)
  return (await inQuietCooldown(ctx.db, rhythm)) ? 'cooldown' : null
}

/**
 * Issue a fresh verification link. The caller has already kept FR-1.4's
 * rhythm. `next` (item 3.5) is where the person was going before they signed
 * up; it rides on the link, already validated, and the onboarding steps carry
 * it the rest of the way.
 */
async function issueVerification(
  db: Context['db'],
  user: { id: string; email: string },
  next = '/',
) {
  const { token, tokenHash, expiresAt } = createVerificationToken()
  await db.emailVerificationToken.create({ data: { userId: user.id, tokenHash, expiresAt } })
  const url = `${env.NEXT_PUBLIC_APP_URL}/verify?token=${token}${
    next === '/' ? '' : `&next=${encodeURIComponent(next)}`
  }`
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
 * FR-1.4's one-minute rhythm. It records a hit when it lets one through, so
 * the second request inside the minute is the one refused.
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
async function noticeExistingAccount(user: {
  id: string
  email: string
  passwordHash?: string | null
}) {
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
          // Item 3.4 — a Google-only account is told the way in it has.
          googleOnly: user.passwordHash === null,
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

/**
 * FR-1.3 step two, once per account. Exported for its test.
 *
 * A confirmation link chooses the first password and never changes one:
 * changing a password is a reset, which ends every other session and tells
 * the owner (decision 0036). Until the phase 12 audit, an older confirmation
 * link still sitting in an inbox set a new password silently, with neither.
 * The link is claimed conditionally, every other one for the account closes
 * with it, and the password is written only where there is none, so two
 * submissions cannot both win.
 */
export async function applyFirstPassword(
  db: Context['db'],
  record: { id: string; user: { id: string; emailVerifiedAt: Date | null } },
  passwordHash: string,
  now: Date,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const claimed = await tx.emailVerificationToken.updateMany({
      where: { id: record.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    })
    if (claimed.count !== 1) return false
    await tx.emailVerificationToken.updateMany({
      where: { userId: record.user.id, consumedAt: null },
      data: { consumedAt: now },
    })
    const set = await tx.user.updateMany({
      where: { id: record.user.id, passwordHash: null },
      data: { passwordHash, emailVerifiedAt: record.user.emailVerifiedAt ?? now },
    })
    if (set.count !== 1) throw new PasswordAlreadySet()
    return true
  })
}

class PasswordAlreadySet extends Error {}

const passwordAlreadySet = () =>
  new TRPCError({
    code: 'CONFLICT',
    message: 'This account already has a password. Sign in, or use “Forgot your password?”.',
  })

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
    .input(
      z.object({
        email: emailSchema,
        /** Item 3.5 — where they were going; rides on the confirmation link. */
        next: z.string().max(2_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Keyed on the address rather than the person: there is no person yet.
      // An address is not an identity, but it is what the action is about, and
      // it is what somebody abusing this has to keep changing.
      const wait = await beforeAuthEmail(ctx, key.addressCooldown(input.email), {
        key: key.signUp(input.email),
        limit: AUTH_LIMITS.signUpsPerAddress,
        windowMs: DAY_MS,
        message: () => 'That address has been used to sign up several times today.',
      })
      if (wait) return { status: wait }

      const existing = await ctx.db.user.findUnique({ where: { email: input.email } })
      if (existing?.emailVerifiedAt) {
        logger.info({ event: 'auth.signup.existing' }, 'sign-up attempted for a verified address')
        return { status: await noticeExistingAccount(existing) }
      }
      // Item 2.3 — the button that produced this call said "By creating an
      // account you agree to the terms and the privacy policy". The rules are
      // read, and recorded as read, on the last onboarding step (FR-13.4).
      const user =
        existing ??
        (await ctx.db.user.create({
          data: { email: input.email, termsAcceptedAt: new Date() },
        }))
      return { status: await issueVerification(ctx.db, user, safeNext(input.next)) }
    }),

  /** FR-1.4: re-sendable with a 60-second cooldown. */
  resendVerification: publicProcedure
    .input(z.object({ email: emailSchema, next: z.string().max(2_000).optional() }))
    .mutation(async ({ ctx, input }) => {
      // The one-minute rhythm is about not spamming one person; the hourly
      // limit is about not letting this endpoint send mail all day.
      const wait = await beforeAuthEmail(ctx, key.addressCooldown(input.email), {
        key: key.verificationResend(input.email),
        limit: AUTH_LIMITS.resendsPerAddress,
        windowMs: HOUR_MS,
        message: (retryAt) =>
          `That link has been sent several times already. Try again ${whenToRetry(retryAt)}.`,
      })
      if (wait) return { status: wait }

      const user = await ctx.db.user.findUnique({ where: { email: input.email } })
      if (user?.emailVerifiedAt) return { status: await noticeExistingAccount(user) }
      if (!user) return { status: 'sent' as const }
      return { status: await issueVerification(ctx.db, user, safeNext(input.next)) }
    }),

  /**
   * Checks a link without consuming it, so the set-password screen can render.
   * `hasPassword`: the account was finished with another link, and this one
   * cannot change its password (decision 0036), so the screen says to sign in.
   */
  verifyEmail: publicProcedure.input(tokenInput).query(async ({ ctx, input }) => {
    const record = await findLiveToken(ctx.db, input.token)
    if (record) {
      // A live link on an account that already has a password cannot change it
      // (decision 0036); the screen says the account is ready.
      return record.user.passwordHash
        ? { status: 'finished' as const, email: record.user.email }
        : { status: 'live' as const, email: record.user.email }
    }
    // Not live: used, or expired. Which, and whether the account was finished,
    // decides what the screen says (FR-1.4; phase 14, item 1.16). Setting a
    // password uses up every link of the account, so the "ready" screen was
    // unreachable, and an honest "send me a new one" needed the address.
    const spent = await ctx.db.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
      select: { user: { select: { email: true, passwordHash: true, emailVerifiedAt: true } } },
    })
    if (!spent) throw expiredLink()
    return spent.user.passwordHash && spent.user.emailVerifiedAt
      ? { status: 'finished' as const, email: spent.user.email }
      : { status: 'expired' as const, email: spent.user.email }
  }),

  /** FR-1.3 step two: consumes the link, marks the email verified and stores the first password. */
  setPassword: publicProcedure
    .input(tokenInput.extend({ password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      const record = await findLiveToken(ctx.db, input.token)
      if (!record) throw expiredLink()
      if (record.user.passwordHash) throw passwordAlreadySet()
      const passwordHash = await hashPassword(input.password)
      try {
        if (!(await applyFirstPassword(ctx.db, record, passwordHash, new Date()))) {
          throw expiredLink()
        }
      } catch (error) {
        if (error instanceof PasswordAlreadySet) throw passwordAlreadySet()
        throw error
      }
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
      // Before the address is looked up, so every kind keeps the same rhythm.
      const wait = await beforeAuthEmail(ctx, key.resetCooldown(input.email), {
        key: key.passwordReset(input.email),
        limit: AUTH_LIMITS.resetsPerAddress,
        windowMs: HOUR_MS,
        message: (retryAt) =>
          `A reset link has been asked for several times already. Try again ${whenToRetry(retryAt)}.`,
      })
      if (wait) return { status: wait }

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

  /** Item 3.2 — reads a change-of-address link without using it, so the page can render. */
  checkEmailChange: publicProcedure.input(tokenInput).query(async ({ ctx, input }) => {
    const record = await findLiveEmailChange(ctx.db, input.token)
    if (!record) throw expiredLink()
    return { newEmail: record.newEmail }
  }),

  /**
   * Item 3.2, step two: the new address becomes the account's, once per link,
   * from the new address's own mailbox and signed in or not. In one
   * transaction the link is claimed, the address is checked to be still free,
   * and the account takes it, confirmed; every session ends (item 3.3), since
   * the address is the account's key. The old address is told afterwards,
   * with the new one shown in part and where to write if it was not them.
   */
  confirmEmailChange: publicProcedure.input(tokenInput).mutation(async ({ ctx, input }) => {
    const record = await findLiveEmailChange(ctx.db, input.token)
    if (!record) throw expiredLink()
    const now = new Date()
    const oldEmail = record.user.email

    const outcome = await ctx.db.$transaction(async (tx) => {
      const claimed = await tx.emailChangeToken.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      })
      if (claimed.count !== 1) return 'expired' as const
      const taken = await tx.user.findUnique({
        where: { email: record.newEmail },
        select: { id: true },
      })
      if (taken && taken.id !== record.user.id) return 'taken' as const
      await tx.emailChangeToken.updateMany({
        where: { userId: record.user.id, consumedAt: null },
        data: { consumedAt: now },
      })
      await tx.user.update({
        where: { id: record.user.id },
        data: { email: record.newEmail, emailVerifiedAt: now, sessionsEndedAt: now },
      })
      return 'changed' as const
    })
    if (outcome === 'expired') throw expiredLink()
    if (outcome === 'taken') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'That address is now used by another account.',
      })
    }

    logger.info(
      { event: 'settings.email.changed', userId: record.user.id },
      'email address changed; every session is refused',
    )
    const mailer = getMailer()
    await afterResponse(async () => {
      try {
        await mailer.send(
          emailChangedNoticeMail({
            to: oldEmail,
            newEmailMasked: maskEmail(record.newEmail),
            supportAddress: contactAddress(),
          }),
        )
      } catch (error) {
        logger.error(
          { event: 'settings.email.notice_failed', userId: record.user.id, error: String(error) },
          'address-changed notice not sent',
        )
      }
    })
    return { email: record.newEmail }
  }),
})

/** Item 3.2 — a change-of-address link that is unused and in date. */
function findLiveEmailChange(db: Context['db'], token: string) {
  return db.emailChangeToken.findFirst({
    where: { tokenHash: hashToken(token), consumedAt: null, expiresAt: { gt: new Date() } },
    include: { user: { select: { id: true, email: true } } },
  })
}
