import { z } from 'zod'

import { pinGenresSchema } from '@/lib/schemas/onboarding'
import { NOTIFICATION_TYPES } from '@/lib/schemas/notifications'
import { ACCOUNT_DELETION_GRACE_DAYS } from '@/lib/schemas/constants'

import { activeProcedure, createTRPCRouter, protectedProcedure } from '../init'

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
          username: true,
          displayName: true,
          bio: true,
          showPassedWork: true,
          readingTypeScale: true,
          readingLineHeight: true,
          deletionRequestedAt: true,
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

    return {
      user,
      pinnedGenreIds: pinned.map((entry) => entry.genre.id),
      pinnedGenres: pinned.map((entry) => entry.genre),
      emailByType,
    }
  }),

  /**
   * FR-1.3 — the username is immutable and is not here. The display name is
   * what the interface shows (decision 0011), so it is the one a writer can
   * change, and changing it changes every credit line at once.
   */
  updateProfile: activeProcedure
    .input(
      z.object({
        displayName: z
          .string()
          .trim()
          .min(1, 'Give yourself a name to show.')
          .max(80, 'That name is too long.'),
        bio: z.string().trim().max(280, 'Keep it under 280 characters.').nullish(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { displayName: input.displayName, bio: input.bio ?? null },
        select: { displayName: true, bio: true },
      }),
    ),

  /** FR-11.2 — pinned genres are editable, and drive the dashboard only. */
  updateGenres: activeProcedure.input(pinGenresSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    const found = await ctx.db.genre.findMany({
      where: { id: { in: input.genreIds } },
      select: { id: true },
    })
    if (found.length !== input.genreIds.length) {
      throw new Error('Unknown genre.')
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
  requestDeletion: activeProcedure.mutation(async ({ ctx }) => {
    const requestedAt = new Date()
    await ctx.db.user.update({
      where: { id: ctx.session.user.id },
      data: { deletionRequestedAt: requestedAt },
    })
    const finishesAt = new Date(
      requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
    )
    return { requestedAt, finishesAt }
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
    await ctx.db.user.updateMany({
      where: { id: ctx.session.user.id, status: 'ACTIVE', deletionRequestedAt: { not: null } },
      data: { deletionRequestedAt: null },
    })
    return { ok: true }
  }),
})
