import { Prisma } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadStoryboard } from '@/lib/authz/guard'
import { recordActivity } from '@/server/activity'
import { logger } from '@/lib/logger'
import { DAILY_LIMITS } from '@/lib/schemas/constants'
import { DAY_MS, enforce, key, whenToRetry } from '@/server/limits'
import { ideaBodySchema } from '@/lib/schemas/help'

import { activeProcedure, actorFrom, createTRPCRouter } from '../init'

const log = logger.child({ router: 'idea' })

/**
 * Ideas (FR-6.9). Plain text, 20 to 400 words, threaded one level deep. Never
 * merged, never a revision. They create a credit only if the author marks one
 * as having helped — one per request (OD-5, decision 0010).
 */
export const ideaRouter = createTRPCRouter({
  post: activeProcedure
    .input(
      z.object({
        requestId: z.string().min(1),
        body: ideaBodySchema,
        /** One level of threading: a reply to an idea, never a reply to a reply. */
        parentId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const request = await ctx.db.contributionRequest.findUnique({
        where: { id: input.requestId },
        select: { id: true, kind: true, state: true, storyboardId: true },
      })
      if (!request) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That request does not exist.' })
      }

      const { permissions } = await loadStoryboard(ctx.db, actor, { id: request.storyboardId })
      if (!permissions.canPostIdea) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot post here.' })
      }
      if (request.state === 'CLOSED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This request is closed.',
        })
      }

      const userId = ctx.session.user.id

      if (input.parentId) {
        const parent = await ctx.db.idea.findUnique({
          where: { id: input.parentId },
          select: { id: true, requestId: true, parentId: true },
        })
        if (parent?.requestId !== request.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'That idea does not exist.' })
        }
        // FR-6.9 — one level deep, so a thread cannot become a forum.
        if (parent.parentId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Replies only go one level deep. Reply to the idea itself.',
          })
        }
      }

      // FR-13.3 — twenty in any twenty-four hours (decision 0017).
      await enforce(
        ctx.db,
        key.ideasPosted(userId),
        { limit: DAILY_LIMITS.ideasPosted, windowMs: DAY_MS },
        (retryAt) =>
          `You can post ${String(DAILY_LIMITS.ideasPosted)} ideas a day. Try again ${whenToRetry(retryAt)}.`,
      )

      // And three per request — which is a cap on a conversation rather than a
      // rate, so it counts the ideas themselves and has no window at all. A
      // reply to somebody else's idea is not one of the three: the limit is
      // there to stop one person filling a request with openings, not to stop
      // them talking.
      const onThisRequest = await ctx.db.idea.count({
        where: { authorId: userId, requestId: request.id, parentId: null },
      })
      if (!input.parentId && onThisRequest >= DAILY_LIMITS.ideasPerRequest) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `You have posted ${String(DAILY_LIMITS.ideasPerRequest)} ideas here already. Reply to one of them instead.`,
        })
      }

      const idea = await ctx.db.idea.create({
        data: {
          requestId: request.id,
          authorId: userId,
          parentId: input.parentId ?? null,
          body: input.body,
        },
        select: { id: true, body: true, createdAt: true, parentId: true },
      })

      await recordActivity(ctx.db, userId)

      log.info(
        { event: 'idea.post', ideaId: idea.id, requestId: request.id, userId },
        'idea posted',
      )
      return idea
    }),

  /**
   * FR-6.9 with OD-5 resolved as "one per request" (decision 0010): the author
   * marks the single idea that unstuck them, and that creates a credit.
   *
   * The partial unique index in the migration is the real guard; this check
   * turns the constraint into a sentence.
   */
  markHelpful: activeProcedure
    .input(z.object({ ideaId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const idea = await ctx.db.idea.findUnique({
        where: { id: input.ideaId },
        select: {
          id: true,
          authorId: true,
          markedHelpful: true,
          request: {
            select: { id: true, storyboardId: true, section: { select: { lineageId: true } } },
          },
        },
      })
      if (!idea) throw new TRPCError({ code: 'NOT_FOUND', message: 'That idea does not exist.' })

      await loadStoryboard(ctx.db, actor, { id: idea.request.storyboardId }, 'suggestion:decide')
      if (idea.markedHelpful) return { ideaId: idea.id, markedHelpful: true }

      try {
        await ctx.db.$transaction(async (tx) => {
          await tx.idea.update({ where: { id: idea.id }, data: { markedHelpful: true } })
          await tx.credit.create({
            data: {
              storyboardId: idea.request.storyboardId,
              contributorId: idea.authorId,
              type: 'IDEA',
              sectionLineage: idea.request.section.lineageId,
              ideaId: idea.id,
              isLive: true,
            },
          })
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new TRPCError({
            code: 'CONFLICT',
            message:
              'You have already credited an idea on this request. Only one can be marked as having helped.',
          })
        }
        throw error
      }

      await ctx.db.notification.create({
        data: {
          userId: idea.authorId,
          type: 'IDEA_MARKED_HELPFUL',
          payload: { ideaId: idea.id, requestId: idea.request.id },
        },
      })

      log.info(
        { event: 'idea.markedHelpful', ideaId: idea.id, requestId: idea.request.id },
        'idea credited',
      )
      return { ideaId: idea.id, markedHelpful: true }
    }),
})
