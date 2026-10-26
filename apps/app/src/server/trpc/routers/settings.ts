import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { env } from '@/env'
import { EMAIL_CHANGE_LINK_LIFETIME } from '@/lib/email-change'
import { maskEmail } from '@/lib/mask-email'
import { hashPassword, verifyPassword } from '@/auth/password'
import { createEmailChangeToken } from '@/auth/tokens'
import { logger } from '@/lib/logger'
import { emailSchema, passwordSchema } from '@/lib/schemas/auth'
import { pinGenresSchema } from '@/lib/schemas/onboarding'
import { bioSchema, displayNameSchema } from '@/lib/schemas/profile'
import { visibilitySchema } from '@/lib/schemas/storyboard'
import { NOTIFICATION_TYPES } from '@/lib/schemas/notifications'
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  AUTH_LIMITS,
  AVATAR,
  PASSWORD_CHARS,
  RECENT_SIGN_IN_MINUTES,
  TYPED_ACCOUNT_MAX_CHARS,
} from '@/lib/schemas/constants'
import { afterResponse } from '@/server/after-response'
import { recordEvent } from '@/server/audit'
import { NotAnImage, shrinkAvatar } from '@/server/avatars'
import { clientAddress } from '@/server/client-address'
import { DAY_MS, enforce, HOUR_MS, key, whenToRetry } from '@/server/limits'
import { getMailer } from '@/server/mail/mailer'
import { deletionRequestedMail } from '@/server/mail/templates/account-deletion'
import { emailChangeMail, emailChangeRequestedMail } from '@/server/mail/templates/email-change'
import { passwordChangedMail } from '@/server/mail/templates/password-changed'
import { formatInZone, timeZoneFromCookieHeader } from '@/lib/time-zone'

import { accountProcedure, activeProcedure, createTRPCRouter, protectedProcedure } from '../init'

const GRACE_MS = ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000

/**
 * Screen 16 — account, genres, notifications and reading preferences.
 *
 * Reading preferences live on `user.readingPreferences` (decision 0009) and
 * genres on `user.pinGenres`; this router owns the two things that are only
 * settings: the display name and the per-type email toggles.
 */
export const settingsRouter = createTRPCRouter({
  /** Everything the settings screen renders, in one round trip. */
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const [user, pinned, prefs] = await Promise.all([
      ctx.db.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          email: true,
          passwordHash: true,
          username: true,
          displayName: true,
          bio: true,
          showPassedWork: true,
          readingTypeScale: true,
          readingLineHeight: true,
          deletionRequestedAt: true,
          // Item 3.13 — the picture's version, for the preview in settings.
          avatar: { select: { updatedAt: true } },
          // Item 3.15 — what a new story starts as.
          defaultVisibility: true,
          // Item 3.16 — the ways in, for "Sign-in methods".
          googleLinkedAt: true,
          googleDisconnectedAt: true,
        },
      }),
      ctx.db.userGenre.findMany({
        where: { userId },
        orderBy: { order: 'asc' },
        select: { genre: { select: { id: true, slug: true, name: true } } },
      }),
      ctx.db.notificationPreference.findMany({
        where: { userId },
        select: { type: true, email: true },
      }),
    ])

    // FR-12.1 — email defaults to on for every type; a row exists only where
    // the user has changed it. Absence is not "off".
    const emailByType = Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [
        type,
        prefs.find((pref) => pref.type === type)?.email ?? true,
      ]),
    ) as Record<(typeof NOTIFICATION_TYPES)[number], boolean>

    // The hash never leaves the server; the screen needs only whether there is one (item 3.1).
    const { passwordHash, ...profile } = user
    return {
      user: { ...profile, hasPassword: passwordHash !== null },
      pinnedGenreIds: pinned.map((entry) => entry.genre.id),
      pinnedGenres: pinned.map((entry) => entry.genre),
      emailByType,
    }
  }),

  /**
   * Phase 14, item 3.1 — change your password while signed in. The limits are
   * taken before anything is looked up (decision 0037), in two families, this
   * account and this client, so a wrong current password costs a try from
   * both and the current password cannot be guessed through settings. The new
   * one meets D-17's rule and is not the old one. Setting `passwordChangedAt`
   * ends every other session (decision 0036); the browser signs in again with
   * the new password so this device stays.
   */
  changePassword: activeProcedure
    .input(
      z.object({
        current: z.string().min(1).max(PASSWORD_CHARS.max),
        next: passwordSchema,
        confirm: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const client = clientAddress(ctx.headers)
      if (client) {
        await enforce(
          ctx.db,
          key.passwordChangesFrom(client),
          { limit: AUTH_LIMITS.passwordChangesPerClientPerHour, windowMs: HOUR_MS },
          (retryAt) => `Too many password changes from here. Try again ${whenToRetry(retryAt)}.`,
        )
      }
      await enforce(
        ctx.db,
        key.passwordChange(userId),
        { limit: AUTH_LIMITS.passwordChangesPerAccountPerHour, windowMs: HOUR_MS },
        (retryAt) => `Too many attempts. Try again ${whenToRetry(retryAt)}.`,
      )
      if (input.next !== input.confirm) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'The two passwords do not match.' })
      }

      const user = await ctx.db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, passwordHash: true },
      })
      if (!user.passwordHash) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "You sign in with Google. To add a password, we'll email you a link.",
        })
      }
      if (!(await verifyPassword(user.passwordHash, input.current))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: "That isn't your current password." })
      }
      if (await verifyPassword(user.passwordHash, input.next)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "That's the password you already have. Choose a different one.",
        })
      }

      const changedAt = new Date()
      await ctx.db.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(input.next), passwordChangedAt: changedAt },
      })

      const mailer = getMailer()
      await afterResponse(async () => {
        try {
          await mailer.send(
            passwordChangedMail({
              to: user.email,
              forgotUrl: `${env.NEXT_PUBLIC_APP_URL}/forgot-password`,
            }),
          )
        } catch (error) {
          logger.error(
            { event: 'settings.password.mail_failed', userId, error: String(error) },
            'password-changed notice not sent',
          )
        }
      })
      logger.info({ event: 'settings.password_changed', userId }, 'password changed from settings')
      return { changedAt }
    }),

  /**
   * Phase 14, item 3.2 — change the email address, step one: a link to the
   * new address. Nothing changes until it is opened. The limits come before
   * the lookup (decision 0037). An account with a password gives it; a
   * Google-only account has nothing to give, so it must have signed in within
   * `RECENT_SIGN_IN_MINUTES`. The answer is "sent" whatever the address, and
   * when the address belongs to another account nothing is sent, so the
   * answer reveals nothing about who has an account.
   */
  requestEmailChange: activeProcedure
    .input(
      z.object({
        newEmail: emailSchema,
        currentPassword: z.string().max(PASSWORD_CHARS.max).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const client = clientAddress(ctx.headers)
      if (client) {
        await enforce(
          ctx.db,
          key.authEmailsFrom(client),
          { limit: AUTH_LIMITS.emailsPerClientPerDay, windowMs: DAY_MS },
          () => 'Too many emails have been asked for from here today. Try again tomorrow.',
        )
      }
      await enforce(
        ctx.db,
        key.emailChange(userId),
        { limit: AUTH_LIMITS.emailChangesPerAccountPerHour, windowMs: HOUR_MS },
        (retryAt) =>
          `A link has been asked for several times already. Try again ${whenToRetry(retryAt)}.`,
      )

      const user = await ctx.db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, passwordHash: true },
      })
      if (input.newEmail === user.email) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That is already your address.' })
      }
      if (user.passwordHash) {
        if (!input.currentPassword) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter your current password.' })
        }
        if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: "That isn't your current password." })
        }
      } else {
        const signedInAt = ctx.session.authAt ?? 0
        if (Date.now() - signedInAt > RECENT_SIGN_IN_MINUTES * 60 * 1000) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Sign out, then sign in again with Google, to change your address.',
          })
        }
      }

      const taken = await ctx.db.user.findUnique({
        where: { email: input.newEmail },
        select: { id: true },
      })
      if (taken) {
        // The same answer, and no link: the owner of that address has an
        // account already, and a stranger learns nothing.
        logger.info(
          { event: 'settings.email.taken', userId },
          'address change asked for a taken address',
        )
        return { status: 'sent' as const, to: input.newEmail }
      }

      const { token, tokenHash, expiresAt } = createEmailChangeToken()
      await ctx.db.emailChangeToken.create({
        data: { userId, newEmail: input.newEmail, tokenHash, expiresAt },
      })
      const url = `${env.NEXT_PUBLIC_APP_URL}/settings/email?token=${token}`
      const mailer = getMailer()
      await afterResponse(async () => {
        try {
          await mailer.send(
            emailChangeMail({ to: input.newEmail, url, lifetime: EMAIL_CHANGE_LINK_LIFETIME }),
          )
          logger.info({ event: 'settings.email.link_sent', userId }, 'address change link sent')
        } catch (error) {
          logger.error(
            { event: 'settings.email.link_failed', userId, error: String(error) },
            'address change link not sent',
          )
        }
        // And the address it would leave, while the move can still be
        // stopped (2026-10-26 final pass).
        try {
          await mailer.send(
            emailChangeRequestedMail({
              to: user.email,
              newEmailMasked: maskEmail(input.newEmail),
              lifetime: EMAIL_CHANGE_LINK_LIFETIME,
              resetUrl: `${env.NEXT_PUBLIC_APP_URL}/forgot-password`,
            }),
          )
        } catch (error) {
          logger.error(
            { event: 'settings.email.warning_failed', userId, error: String(error) },
            'address change warning not sent',
          )
        }
      })
      return { status: 'sent' as const, to: input.newEmail }
    }),

  /**
   * Phase 14, item 3.3 — sign out on every device, this one included. The
   * next request from any of them finds `sessionsEndedAt` after its `authAt`
   * and is refused (`sessionRefused` in `auth/config.ts`); the browser that
   * asked then goes to sign in.
   */
  signOutEverywhere: activeProcedure.mutation(async ({ ctx }) => {
    const endedAt = new Date()
    await ctx.db.user.update({
      where: { id: ctx.session.user.id },
      data: { sessionsEndedAt: endedAt },
    })
    logger.info(
      { event: 'settings.sessions_ended', userId: ctx.session.user.id },
      'signed out on every device',
    )
    return { endedAt }
  }),

  /**
   * FR-1.3 — the username is immutable and is not here. The display name is
   * what the interface shows (decision 0011), so it is the one a writer can
   * change, and changing it changes every credit line at once.
   */
  updateProfile: activeProcedure
    // Item 3.8 — the rules live in `lib/schemas/profile.ts`, with the form.
    .input(z.object({ displayName: displayNameSchema, bio: bioSchema.nullish() }))
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { displayName: input.displayName, bio: input.bio ?? null },
        select: { displayName: true, bio: true },
      }),
    ),

  /**
   * Phase 14, item 3.13 (D-5) — the picture. The route handler at
   * `/api/avatar` reads the upload and shrinks it to the icon; this stores
   * it, after shrinking it again itself, so nothing but the icon form ever
   * reaches the table whoever calls it. `activeProcedure`: the gate every
   * other settings change goes through (NFR-6).
   */
  setAvatar: activeProcedure
    .input(
      z.object({
        /** The picture, base64. The icon form is a few kilobytes. */
        image: z.string().max(Math.ceil((AVATAR.maxStoredBytes * 4) / 3) + 4),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await enforce(
        ctx.db,
        key.avatarUpload(userId),
        { limit: AUTH_LIMITS.avatarUploadsPerAccountPerHour, windowMs: HOUR_MS },
        (retryAt) => `That is a lot of pictures. Try again ${whenToRetry(retryAt)}.`,
      )
      let shrunk: Awaited<ReturnType<typeof shrinkAvatar>>
      try {
        shrunk = await shrinkAvatar(Buffer.from(input.image, 'base64'))
      } catch (error) {
        if (error instanceof NotAnImage) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
        }
        throw error
      }
      if (shrunk.bytes.byteLength > AVATAR.maxStoredBytes) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That picture could not be made small enough. Try a simpler one.',
        })
      }
      // A copy into a plain Uint8Array: the client's Bytes type wants one.
      const bytes = new Uint8Array(shrunk.bytes)
      const row = await ctx.db.userAvatar.upsert({
        where: { userId },
        create: { userId, bytes, contentType: shrunk.contentType },
        update: { bytes, contentType: shrunk.contentType },
        select: { updatedAt: true },
      })
      logger.info({ event: 'settings.avatar.set', userId }, 'profile picture set')
      return { updatedAt: row.updatedAt }
    }),

  /** Item 3.13 — no picture: the initials come back everywhere at once. */
  removeAvatar: activeProcedure.mutation(async ({ ctx }) => {
    const { count } = await ctx.db.userAvatar.deleteMany({
      where: { userId: ctx.session.user.id },
    })
    if (count > 0) {
      logger.info(
        { event: 'settings.avatar.removed', userId: ctx.session.user.id },
        'profile picture removed',
      )
    }
    return { removed: count > 0 }
  }),

  /** Item 3.15 (screen 16) — what the create form and the import start from. */
  setDefaultVisibility: activeProcedure
    .input(z.object({ visibility: visibilitySchema }))
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { defaultVisibility: input.visibility },
        select: { defaultVisibility: true },
      }),
    ),

  /**
   * Item 3.16 — whether Google may sign this account in. Turning it off needs
   * a password, or there would be no way in at all; it also forgets the link,
   * so settings stop saying Google is connected. Turning it back on lets the
   * next Google sign-in link again; nothing is linked until it does.
   */
  setGoogleSignIn: activeProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      if (!input.enabled) {
        const user = await ctx.db.user.findUniqueOrThrow({
          where: { id: userId },
          select: { passwordHash: true },
        })
        if (!user.passwordHash) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Set a password first. Without one, Google is your only way in.',
          })
        }
      }
      const row = await ctx.db.user.update({
        where: { id: userId },
        data: input.enabled
          ? { googleDisconnectedAt: null }
          : { googleDisconnectedAt: new Date(), googleLinkedAt: null },
        select: { googleLinkedAt: true, googleDisconnectedAt: true },
      })
      logger.info(
        { event: input.enabled ? 'settings.google.allowed' : 'settings.google.off', userId },
        'Google sign-in setting changed',
      )
      return row
    }),

  /** FR-11.2 — pinned genres are editable, and drive the dashboard only. */
  updateGenres: activeProcedure.input(pinGenresSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    const found = await ctx.db.genre.findMany({
      where: { id: { in: input.genreIds } },
      select: { id: true },
    })
    if (found.length !== input.genreIds.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown genre.' })
    }

    await ctx.db.$transaction(async (tx) => {
      await tx.userGenre.deleteMany({ where: { userId } })
      await tx.userGenre.createMany({
        data: input.genreIds.map((genreId, order) => ({ userId, genreId, order })),
      })
    })
    return { ok: true }
  }),

  /**
   * FR-12.1 — every notification type is independently toggleable for email.
   * In-app cannot be disabled, so there is no switch for it and no procedure
   * that could turn one off.
   */
  setEmailPreference: activeProcedure
    .input(z.object({ type: z.enum(NOTIFICATION_TYPES), email: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await ctx.db.notificationPreference.upsert({
        where: { userId_type: { userId, type: input.type } },
        create: { userId, type: input.type, email: input.email },
        update: { email: input.email },
      })
      return { type: input.type, email: input.email }
    }),

  /** Turn every email off, or back on, without twelve clicks. */
  setAllEmail: activeProcedure
    .input(z.object({ email: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await ctx.db.$transaction(
        NOTIFICATION_TYPES.map((type) =>
          ctx.db.notificationPreference.upsert({
            where: { userId_type: { userId, type } },
            create: { userId, type, email: input.email },
            update: { email: input.email },
          }),
        ),
      )
      return { ok: true }
    }),

  /**
   * OD-3's second half — delete this account (decision 0024).
   *
   * Sets a date; erases nothing. The account freezes immediately — no writing,
   * no email, no profile — and the daily purge finishes it after
   * `ACCOUNT_DELETION_GRACE_DAYS`. The seven days are not a cooling-off
   * courtesy: an account somebody else has got into can be destroyed in one
   * click, and a window in which the real owner can sign in and stop it is what
   * makes that recoverable.
   *
   * What it does not ask: which storyboards to keep. All of them stay, and the
   * dialog says so before this is called. A storyboard is rarely only its
   * owner's — somebody else's accepted suggestion is in it, somebody else's
   * credit is on it — so "delete my work too" is not the account holder's alone
   * to choose.
   */
  requestDeletion: accountProcedure
    .input(z.object({ confirm: z.string().trim().min(1).max(TYPED_ACCOUNT_MAX_CHARS) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const user = await ctx.db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, username: true },
      })

      // Checked here, and not only by the screen's disabled button (phase 14,
      // item 1.5): a call made from a browser's console was as good as one
      // typed out. The username, or the address for an account without one.
      const matches = user.username
        ? input.confirm === user.username
        : input.confirm.toLowerCase() === user.email.toLowerCase()
      if (!matches) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: user.username
            ? 'Type your username exactly as it is, to confirm.'
            : 'Type the email address of this account, to confirm.',
        })
      }

      const requestedAt = new Date()
      await ctx.db.user.update({
        where: { id: userId },
        data: { deletionRequestedAt: requestedAt },
      })
      const finishesAt = new Date(requestedAt.getTime() + GRACE_MS)

      // Told at once, at the address itself. Decision 0024 promised the week
      // of grace as the way to catch a request that was not the owner's, and
      // nothing told the owner (phase 14, item 1.5).
      const mailer = getMailer()
      await afterResponse(async () => {
        try {
          await mailer.send(
            deletionRequestedMail({
              to: user.email,
              // The day in the zone of the browser that asked (item 1.18).
              finishesOn: formatInZone(
                finishesAt,
                'long',
                timeZoneFromCookieHeader(ctx.headers.get('cookie')),
              ),
              settingsUrl: `${env.NEXT_PUBLIC_APP_URL}/settings`,
            }),
          )
        } catch (error) {
          // The request stands; the banner on every page says the same.
          logger.error(
            { event: 'settings.deletion.mail_failed', userId, error: String(error) },
            'could not send the deletion notice',
          )
        }
      })

      logger.info({ event: 'account.deletion_requested', userId }, 'account deletion requested')
      // Item 10.2 — stored as well as logged.
      await recordEvent(ctx.db, {
        event: 'account.deletion_requested',
        actorId: userId,
        target: { type: 'USER', id: userId },
      })
      return { requestedAt, finishesAt }
    }),

  /**
   * For the banner every signed-in page shows while a deletion is pending
   * (phase 14, item 1.5). `protectedProcedure`, like `cancelDeletion`: the
   * frozen account is the one that has to see it.
   */
  deletionStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: { deletionRequestedAt: true, bannedAt: true },
    })
    if (!user.deletionRequestedAt) return null
    return {
      requestedAt: user.deletionRequestedAt,
      finishesAt: new Date(user.deletionRequestedAt.getTime() + GRACE_MS),
      // Decision 0043 (item 2b.5) — a deletion an administrator started comes
      // with a ban, and cannot be kept from here.
      byAdmin: user.bannedAt !== null,
    }
  }),

  /**
   * Change your mind, inside the grace period.
   *
   * `protectedProcedure`, not `activeProcedure`, and that is the whole reason
   * this comment exists: `activeProcedure` refuses an account with a pending
   * deletion, so building this the usual way would make the undo unreachable by
   * exactly the people who need it. The structural test in `procedures.test.ts`
   * names this procedure as the one deliberate exception.
   */
  cancelDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    // Only from inside the grace period. Once the purge has run there is no
    // password to sign in with and nothing left to restore.
    // And never a banned account (decision 0043, item 2b.5): an administrator
    // started that deletion, and the way back is the support address.
    const kept = await ctx.db.user.updateMany({
      where: {
        id: ctx.session.user.id,
        status: 'ACTIVE',
        bannedAt: null,
        deletionRequestedAt: { not: null },
      },
      data: { deletionRequestedAt: null },
    })
    // Item 10.2 (NFR-7) — a deletion called off is one of the moments kept,
    // and it had no log line of its own. Only when one was called off.
    if (kept.count === 1) {
      const userId = ctx.session.user.id
      logger.info({ event: 'account.deletion_cancelled', userId }, 'account deletion cancelled')
      await recordEvent(ctx.db, {
        event: 'account.deletion_cancelled',
        actorId: userId,
        target: { type: 'USER', id: userId },
      })
    }
    return { ok: true }
  }),
})
