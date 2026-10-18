import { Prisma } from '@storyboard/db'
import { TRPCError } from '@trpc/server'

import { USERNAME_TAKEN_MESSAGE, isRetiredUsername } from '@/server/retired-usernames'
import { z } from 'zod'

import { usernameSchema } from '@/lib/schemas/auth'
import { READING_LINE_HEIGHT, READING_TYPE_SCALE } from '@/lib/schemas/constants'
import { pinGenresSchema } from '@/lib/schemas/onboarding'

import {
  accountProcedure,
  activeProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../init'

/** What onboarding still wants from this user (FR-1.3). */
function nextOnboardingStep(user: {
  passwordHash: string | null
  username: string | null
  onboardedAt: Date | null
}): 'password' | 'username' | 'genres' | null {
  if (!user.passwordHash) return 'password'
  if (!user.username) return 'username'
  if (!user.onboardedAt) return 'genres'
  return null
}

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) =>
    ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        onboardedAt: true,
        createdAt: true,
        // Item 3.15 — what the create form and the import start from.
        defaultVisibility: true,
      },
    }),
  ),

  /** Where to send a half-onboarded user. Null once they are done. */
  /** Item 3.13 — the viewer's own picture, `{ updatedAt }` or nothing, for the header. */
  avatar: protectedProcedure.query(({ ctx }) =>
    ctx.db.userAvatar.findUnique({
      where: { userId: ctx.session.user.id },
      select: { updatedAt: true },
    }),
  ),

  onboardingStep: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: { passwordHash: true, username: true, onboardedAt: true },
    })
    return { step: nextOnboardingStep(user) }
  }),

  /**
   * FR-1.3 step 3. The username is immutable in v1 and is printed in every
   * credit line forever, so this refuses to overwrite one that is already set
   * rather than quietly updating it.
   */
  chooseUsername: accountProcedure
    .input(z.object({ username: usernameSchema }))
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.user.findUniqueOrThrow({
        where: { id: ctx.session.user.id },
        select: { username: true, displayName: true },
      })
      if (current.username) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Your username is already set and cannot be changed.',
        })
      }
      // Decision 0042 (item 1.6) — a deleted account's name is never taken
      // again, and the refusal reads as for any taken name.
      if (await isRetiredUsername(ctx.db, input.username)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: USERNAME_TAKEN_MESSAGE })
      }

      try {
        const user = await ctx.db.user.update({
          where: { id: ctx.session.user.id },
          data: {
            username: input.username,
            // A display name the user can edit later; the username cannot
            // change. Only when there is none yet: an account made with Google
            // arrives with the name Google holds (decision 0027), and this
            // overwrote it, so "Ada Lovelace" was credited as "ada-l" (phase
            // 14, item 1.3).
            displayName: current.displayName?.trim() ? current.displayName : input.username,
          },
          select: { username: true, onboardedAt: true },
        })
        return { username: user.username, onboarded: user.onboardedAt !== null }
      } catch (error) {
        // The unique index is the real check: two people can pass the
        // availability query at the same moment and only one can win.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: USERNAME_TAKEN_MESSAGE,
          })
        }
        throw error
      }
    }),

  /** Live feedback on the username step. Advisory only; the unique index decides. */
  usernameAvailable: protectedProcedure
    .input(z.object({ username: usernameSchema }))
    .query(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({
        where: { username: input.username },
        select: { id: true },
      })
      // A retired name (decision 0042, item 1.6) answers exactly as a live one:
      // the owner asked that nothing say an account was deleted.
      if (existing || (await isRetiredUsername(ctx.db, input.username))) {
        return { available: false, reason: USERNAME_TAKEN_MESSAGE }
      }
      return { available: true, reason: null }
    }),

  /**
   * FR-1.3 step 4, and the last step: completing it stamps `onboardedAt`, which
   * is what the proxy and `onboardingStep` read. Replacing the set wholesale
   * keeps `order` honest when the user re-ranks their genres later (FR-11.2).
   */
  pinGenres: activeProcedure.input(pinGenresSchema).mutation(async ({ ctx, input }) => {
    const found = await ctx.db.genre.findMany({
      where: { id: { in: input.genreIds } },
      select: { id: true },
    })
    if (found.length !== input.genreIds.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown genre.' })
    }

    const userId = ctx.session.user.id
    const onboardedAt = await ctx.db.$transaction(async (tx) => {
      await tx.userGenre.deleteMany({ where: { userId } })
      await tx.userGenre.createMany({
        data: input.genreIds.map((genreId, order) => ({ userId, genreId, order })),
      })

      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { username: true, onboardedAt: true, rulesSeenAt: true },
      })
      if (!user.username) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Choose a username first.',
        })
      }
      // FR-13.4 (item 2.3) — the rules are read here, once, and recorded as
      // read. An account from before this landed was stamped at creation and
      // is not asked again.
      if (!user.rulesSeenAt) {
        if (input.rulesRead !== true) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Tick "I have read the community rules" to finish.',
          })
        }
        await tx.user.update({ where: { id: userId }, data: { rulesSeenAt: new Date() } })
      }
      if (user.onboardedAt) return user.onboardedAt

      const updated = await tx.user.update({
        where: { id: userId },
        data: { onboardedAt: new Date() },
        select: { onboardedAt: true },
      })
      return updated.onboardedAt
    })

    return { onboarded: onboardedAt !== null }
  }),

  /**
   * NFR-5 — reading comfort, persisted per user so it follows them between
   * devices rather than living in one browser (decision 0009).
   */
  readingPreferences: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: { readingTypeScale: true, readingLineHeight: true },
    })
    return user
  }),

  setReadingPreferences: activeProcedure
    .input(
      z.object({
        typeScale: z
          .number()
          .int()
          .min(READING_TYPE_SCALE.min)
          .max(READING_TYPE_SCALE.max)
          .optional(),
        lineHeight: z
          .number()
          .int()
          .min(READING_LINE_HEIGHT.min)
          .max(READING_LINE_HEIGHT.max)
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: {
          ...(input.typeScale === undefined ? {} : { readingTypeScale: input.typeScale }),
          ...(input.lineHeight === undefined ? {} : { readingLineHeight: input.lineHeight }),
        },
        select: { readingTypeScale: true, readingLineHeight: true },
      }),
    ),

  /** The user's pinned genres, in their ranked order. */
  pinnedGenres: protectedProcedure.query(({ ctx }) =>
    ctx.db.userGenre.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { order: 'asc' },
      select: { order: true, genre: { select: { id: true, slug: true, name: true } } },
    }),
  ),

  /**
   * The 24 reference genres (FR-15.6). Public because the marketing site and
   * the signed-out browse filters both want them.
   */
  genres: publicProcedure.query(({ ctx }) =>
    ctx.db.genre.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, name: true },
    }),
  ),
})
