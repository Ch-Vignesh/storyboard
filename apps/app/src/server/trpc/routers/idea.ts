import { Prisma } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { assertNotBlocked, loadStoryboard } from '@/lib/authz/guard'
import { recordActivity } from '@/server/activity'
import { timeZoneFromHeaders } from '@/lib/time-zone'
import { afterCommit } from '@/server/after-commit'
import { hasBlocked } from '@/server/blocks'
import { notifyAuthors } from '@/server/notify-authors'
import { logger } from '@/lib/logger'
import { DAILY_LIMITS, IDEA_EDIT_MINUTES } from '@/lib/schemas/constants'
import { DAY_MS, enforce, key, whenToRetry } from '@/server/limits'
import { ideaBodySchema, ideaChangeCutoff, ideaReplySchema, ideaTakenNow } from '@/lib/schemas/help'
import { AUTHORS_SELECT, authorsOf, isIdeaAnswer, settleAnswered } from '@/server/answers'

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
      z
        .object({
          requestId: z.string().min(1),
          body: z.string().trim(),
          /** One level of threading: a reply to an idea, never a reply to a reply. */
          parentId: z.string().min(1).optional(),
        })
        // Item 6.8 (D-7) — an idea is 20 to 400 words; a reply, 1 to 400.
        .superRefine((value, issues) => {
          const schema = value.parentId ? ideaReplySchema : ideaBodySchema
          const result = schema.safeParse(value.body)
          if (!result.success) {
            issues.addIssue({
              code: 'custom',
              message: result.error.issues[0]?.message ?? 'Say a little more.',
              path: ['body'],
            })
          }
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

      const { permissions, resource } = await loadStoryboard(ctx.db, actor, {
        id: request.storyboardId,
      })
      if (!permissions.canPostIdea) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot post here.' })
      }
      // Decision 0046 (item 2.9) — not on a story whose author has blocked you.
      await assertNotBlocked(ctx.db, actor, resource)
      // FR-5.2 (phase 14, item 1.8) — ideas answer a "help me think" request.
      // A request for prose took them too, and nobody was told.
      if (request.kind !== 'UNBLOCK') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This request is asking for prose, not ideas. Write a suggestion instead.',
        })
      }
      // FR-5.9 with FR-6.9 — and only while it takes them. It refused closed
      // requests alone, so a resolved one went on taking new openings.
      const taken = ideaTakenNow(request.state, input.parentId !== undefined)
      if (!taken.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: taken.reason })
      }

      const userId = ctx.session.user.id

      // The idea a reply answers, and who wrote it (item 1.9).
      let parent: { id: string; authorId: string } | null = null
      if (input.parentId) {
        const found = await ctx.db.idea.findUnique({
          where: { id: input.parentId },
          select: { id: true, requestId: true, parentId: true, authorId: true },
        })
        if (found?.requestId !== request.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'That idea does not exist.' })
        }
        // FR-6.9 — one level deep, so a thread cannot become a forum.
        if (found.parentId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Replies only go one level deep. Reply to the idea itself.',
          })
        }
        parent = { id: found.id, authorId: found.authorId }
      }

      // Three per request — which is a cap on a conversation rather than a
      // rate, so it counts the ideas themselves and has no window at all. A
      // reply to somebody else's idea is not one of the three: the limit is
      // there to stop one person filling a request with openings, not to stop
      // them talking. Checked before the daily limit is spent: a refusal here
      // used to cost one of the day's twenty (phase 12 audit).
      const onThisRequest = await ctx.db.idea.count({
        where: { authorId: userId, requestId: request.id, parentId: null },
      })
      if (!input.parentId && onThisRequest >= DAILY_LIMITS.ideasPerRequest) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `You have posted ${String(DAILY_LIMITS.ideasPerRequest)} ideas here already. Reply to one of them instead.`,
        })
      }

      // FR-13.3 — twenty in any twenty-four hours (decision 0017).
      await enforce(
        ctx.db,
        key.ideasPosted(userId),
        { limit: DAILY_LIMITS.ideasPosted, windowMs: DAY_MS },
        (retryAt) =>
          `You can post ${String(DAILY_LIMITS.ideasPosted)} ideas a day. Try again ${whenToRetry(retryAt)}.`,
      )

      const idea = await ctx.db.idea.create({
        data: {
          requestId: request.id,
          authorId: userId,
          parentId: input.parentId ?? null,
          body: input.body,
        },
        select: { id: true, body: true, createdAt: true, parentId: true },
      })

      // FR-5.9 (phase 14, item 1.12) — the first idea from outside the story
      // answers the request, as the first suggestion does. Not a reply, and
      // not the author thinking aloud under their own request.
      const fromOutside = permissions.role !== 'owner' && permissions.role !== 'coauthor'
      if (!input.parentId && fromOutside) {
        await ctx.db.contributionRequest.updateMany({
          where: { id: request.id, state: 'OPEN' },
          data: { state: 'ANSWERED' },
        })
      }

      // FR-12.2 — "an idea arrived", hourly (FR-12.3). Never sent until the
      // 2026-10-16 spec review. A reply also tells the writer of the idea it
      // answers, unless that is who replied; replies told only the authors
      // until phase 14 (item 1.9), so a helper never learned the author had
      // answered them. An author who is that writer hears once, as the writer.
      const repliedTo = parent && parent.authorId !== userId ? parent : null
      await afterCommit('idea.post.notify', async () => {
        // Decision 0046 — not to a writer who has blocked whoever replied, as
        // `notifyAuthors` holds for the authors (2026-10-26 final pass).
        if (repliedTo && !(await hasBlocked(ctx.db, repliedTo.authorId, userId))) {
          await ctx.db.notification.create({
            data: {
              userId: repliedTo.authorId,
              type: 'IDEA_REPLY',
              payload: { requestId: request.id, ideaId: repliedTo.id, replyId: idea.id },
            },
          })
        }
        await notifyAuthors(
          ctx.db,
          request.storyboardId,
          'IDEA_RECEIVED',
          { requestId: request.id, ideaId: idea.id },
          userId,
          repliedTo ? [repliedTo.authorId] : [],
        )
      })
      // FR-9.3 with D-6 (item 6.13) — an idea from outside the story marks the
      // calendar, on the day it is where its writer is. Not a reply.
      if (!input.parentId && fromOutside) {
        await recordActivity(ctx.db, userId, new Date(), timeZoneFromHeaders(ctx.headers))
      }

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
  /**
   * Phase 14, item 6.8 (FR-6.9) — an idea changed by its writer, within
   * `IDEA_EDIT_MINUTES` of posting it and not once it was marked as having
   * helped: by then somebody has acted on the words as they were. One
   * conditional write, so the window and the mark are checked as it is made.
   */
  edit: activeProcedure
    .input(z.object({ ideaId: z.string().min(1), body: z.string().trim() }))
    .mutation(async ({ ctx, input }) => {
      const idea = await ctx.db.idea.findFirst({
        where: { id: input.ideaId, authorId: ctx.session.user.id },
        select: {
          parentId: true,
          markedHelpful: true,
          deletedAt: true,
          hiddenAt: true,
          createdAt: true,
          request: { select: { storyboardId: true } },
        },
      })
      if (!idea) throw new TRPCError({ code: 'NOT_FOUND', message: 'That idea is not yours.' })
      // Decision 0046 — a change is a post, and a writer an author blocked
      // posts nothing on their stories (2026-10-26 final pass).
      const actor = actorFrom(ctx.session, ctx.account)
      const storyboard = await loadStoryboard(ctx.db, actor, { id: idea.request.storyboardId })
      await assertNotBlocked(ctx.db, actor, storyboard.resource)
      // Item 2.7 — hidden, or reported and waiting on a moderator, its words
      // stay as they were reported; "show it again" would otherwise show words
      // no moderator read. Its writer can see it was hidden, so that is said.
      const underReview = () =>
        new TRPCError({
          code: 'CONFLICT',
          message: idea.hiddenAt
            ? 'This idea was hidden after a report, so it stays as it was.'
            : "This idea can't change now.",
        })
      if (idea.hiddenAt) throw underReview()
      const schema = idea.parentId ? ideaReplySchema : ideaBodySchema
      const body = schema.safeParse(input.body)
      if (!body.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: body.error.issues[0]?.message ?? 'Say a little more.',
        })
      }
      const outcome = await ctx.db.$transaction(async (tx) => {
        const reported = await tx.report.count({
          where: { targetType: 'IDEA', targetId: input.ideaId, state: 'OPEN' },
        })
        if (reported > 0) return 'under review' as const
        const { count } = await tx.idea.updateMany({
          where: {
            id: input.ideaId,
            authorId: ctx.session.user.id,
            markedHelpful: false,
            deletedAt: null,
            hiddenAt: null,
            createdAt: { gt: ideaChangeCutoff() },
          },
          data: { body: body.data, editedAt: new Date() },
        })
        return count
      })
      if (outcome === 'under review') throw underReview()
      if (outcome === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: idea.markedHelpful
            ? 'This idea was marked as the one that helped, so it stays as it was.'
            : idea.deletedAt
              ? 'This idea was removed.'
              : `An idea can be changed for ${String(IDEA_EDIT_MINUTES)} minutes after it is posted.`,
        })
      }
      log.info({ event: 'idea.edit', ideaId: input.ideaId }, 'idea changed')
      return { ok: true }
    }),

  /**
   * Item 6.8 — an idea removed by its writer: it reads "Removed by its
   * writer", and its replies stay, because they are other people's. Not one
   * marked as having helped: that is part of the request's record.
   */
  remove: activeProcedure
    .input(z.object({ ideaId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.idea.updateMany({
        where: {
          id: input.ideaId,
          authorId: ctx.session.user.id,
          markedHelpful: false,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      })
      if (count === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That idea is not yours to remove, or it was the one that helped.',
        })
      }
      // The last idea from outside gone, a "help me think" request is open again.
      const { requestId } = await ctx.db.idea.findUniqueOrThrow({
        where: { id: input.ideaId },
        select: { requestId: true },
      })
      await settleAnswered(ctx.db, requestId)
      log.info({ event: 'idea.remove', ideaId: input.ideaId }, 'idea removed by its writer')
      return { ok: true }
    }),

  markHelpful: activeProcedure
    .input(z.object({ ideaId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const idea = await ctx.db.idea.findUnique({
        where: { id: input.ideaId },
        select: {
          id: true,
          authorId: true,
          parentId: true,
          markedHelpful: true,
          hiddenAt: true,
          deletedAt: true,
          request: {
            select: {
              id: true,
              storyboardId: true,
              section: { select: { lineageId: true } },
              storyboard: { select: AUTHORS_SELECT },
            },
          },
        },
      })
      if (!idea) throw new TRPCError({ code: 'NOT_FOUND', message: 'That idea does not exist.' })

      await loadStoryboard(ctx.db, actor, { id: idea.request.storyboardId }, 'suggestion:decide')
      if (idea.markedHelpful) return { ideaId: idea.id, markedHelpful: true }
      // Hidden after a report (item 2.7, decision 0045): not an answer.
      if (idea.hiddenAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This idea was removed after a report, so it cannot be the one that helped.',
        })
      }
      // Item 6.8 — words their writer took back earn no credit (2026-10-24 final pass).
      if (idea.deletedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Its writer removed this idea, so it cannot be the one that helped.',
        })
      }
      // FR-6.9, FR-9.1 (item 1.7; decision 0041) — a credit is for help from
      // outside the story: not a reply, and not an author's own idea. Both
      // were taken, and credited, until phase 14.
      if (!isIdeaAnswer(idea, authorsOf(idea.request.storyboard))) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only an idea from outside the story can be the one that helped.',
        })
      }

      let marked = false
      try {
        marked = await ctx.db.$transaction(async (tx) => {
          // Only the first of two at once. Marking the same idea twice set the
          // same flag twice, which the partial index does not see, and made
          // two credits (phase 12 audit).
          // Nor one removed or hidden since it was read above.
          const flipped = await tx.idea.updateMany({
            where: { id: idea.id, markedHelpful: false, deletedAt: null, hiddenAt: null },
            data: { markedHelpful: true },
          })
          if (flipped.count !== 1) return false
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
          // FR-5.9 — the request is resolved by the idea that helped (phase
          // 14, item 1.12). A closed one stays closed; the credit still stands.
          await tx.contributionRequest.updateMany({
            where: { id: idea.request.id, state: { in: ['OPEN', 'ANSWERED'] } },
            data: { state: 'RESOLVED', resolvedAt: new Date() },
          })
          return true
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

      // Somebody else marked it a moment ago; that one made the credit.
      if (!marked) return { ideaId: idea.id, markedHelpful: true }

      await afterCommit('idea.markHelpful.notify', () =>
        ctx.db.notification.create({
          data: {
            userId: idea.authorId,
            type: 'IDEA_MARKED_HELPFUL',
            // Item 6.9 — who marked it, for the row to name.
            payload: { ideaId: idea.id, requestId: idea.request.id, byId: ctx.session.user.id },
          },
        }),
      )

      log.info(
        { event: 'idea.markedHelpful', ideaId: idea.id, requestId: idea.request.id },
        'idea credited',
      )
      return { ideaId: idea.id, markedHelpful: true }
    }),
})
