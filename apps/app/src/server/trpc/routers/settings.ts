import { z } from 'zod'

import { pinGenresSchema } from '@/lib/schemas/onboarding'
import { NOTIFICATION_TYPES } from '@/lib/schemas/notifications'

import { createTRPCRouter, protectedProcedure } from '../init'

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
  updateProfile: protectedProcedure
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
  updateGenres: protectedProcedure.input(pinGenresSchema).mutation(async ({ ctx, input }) => {
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
  setEmailPreference: protectedProcedure
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
  setAllEmail: protectedProcedure
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
})
