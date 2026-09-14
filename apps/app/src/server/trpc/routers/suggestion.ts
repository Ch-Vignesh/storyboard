import { Prisma, type PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadStoryboard } from '@/lib/authz/guard'
import { recordActivity, recordActivityFor } from '@/server/activity'
import { isAuthor } from '@/lib/authz'
import { emptyDoc, flavourForStoryType, parseDoc } from '@/lib/doc/schema'
import { derive, hashContent } from '@/lib/doc/text'
import { publicId } from '@/lib/ids'
import { logger } from '@/lib/logger'
import { DAILY_LIMITS, SUGGESTION_QUOTA_PER_STORYBOARD } from '@/lib/schemas/constants'
import { passChipSchema, suggestionNoteSchema } from '@/lib/schemas/help'

import { actorFrom, createTRPCRouter, protectedProcedure, publicProcedure } from '../init'

const log = logger.child({ router: 'suggestion' })

/**
 * Loads a request with everything a suggestion needs to be written against.
 * Anyone who can read the storyboard can reach this; what they may *do* is
 * decided per procedure.
 */
async function loadRequestFor(db: PrismaClient, actor: { id: string } | null, requestId: string) {
  const request = await db.contributionRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      kind: true,
      state: true,
      minWords: true,
      maxWords: true,
      storyboardId: true,
      sectionId: true,
      section: { select: { id: true, currentRevisionId: true } },
      storyboard: { select: { type: true } },
    },
  })
  if (!request) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'That request does not exist.' })
  }
  const storyboard = await loadStoryboard(db, actor, { id: request.storyboardId })
  return { request, storyboard }
}

export const suggestionRouter = createTRPCRouter({
  /**
   * FR-6.1 — a suggestion begins as a private draft, pre-filled with the
   * current section text for a rewrite and empty for a continue. Nothing is
   * visible to anyone until it is sent.
   */
  startDraft: protectedProcedure
    .input(z.object({ requestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      const { request, storyboard } = await loadRequestFor(ctx.db, actor, input.requestId)

      if (request.kind === 'UNBLOCK') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This request is asking for ideas, not prose. Post an idea instead.',
        })
      }
      if (!storyboard.permissions.canSubmitSuggestion) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot suggest here.' })
      }

      const existing = await ctx.db.suggestion.findFirst({
        where: { requestId: request.id, contributorId: ctx.session.user.id, state: 'DRAFT' },
        select: { id: true, publicId: true },
      })
      if (existing) return existing

      const head = request.section.currentRevisionId
        ? await ctx.db.revision.findUnique({
            where: { id: request.section.currentRevisionId },
            select: { contentJson: true, contentText: true, wordCount: true },
          })
        : null

      if (!request.section.currentRevisionId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That section has no text to write against yet.',
        })
      }

      const flavour = flavourForStoryType(request.storyboard.type)
      // FR-6.1 — pre-filled for a rewrite, empty for a continue.
      const content = request.kind === 'REWRITE' && head ? head.contentJson : emptyDoc(flavour)
      const derived = derive(parseDoc(content, flavour))

      return ctx.db.suggestion.create({
        data: {
          publicId: publicId(),
          requestId: request.id,
          contributorId: ctx.session.user.id,
          // FR-6.3 — the staleness anchor.
          baseRevisionId: request.section.currentRevisionId,
          contentJson: content ?? {},
          contentText: derived.contentText,
          wordCount: derived.wordCount,
          state: 'DRAFT',
        },
        select: { id: true, publicId: true },
      })
    }),

  /** Autosave for the composer. A draft is private to its author (FR-6.1). */
  saveDraft: protectedProcedure
    .input(z.object({ suggestionId: z.string().min(1), contentJson: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const suggestion = await requireOwnDraft(ctx, input.suggestionId)
      const storyType = await ctx.db.storyboard.findUniqueOrThrow({
        where: { id: suggestion.request.storyboardId },
        select: { type: true },
      })
      const doc = parseDoc(input.contentJson, flavourForStoryType(storyType.type))
      const derived = derive(doc)

      return ctx.db.suggestion.update({
        where: { id: suggestion.id },
        data: {
          contentJson: doc,
          contentText: derived.contentText,
          wordCount: derived.wordCount,
        },
        select: { id: true, wordCount: true },
      })
    }),

  /**
   * FR-6.2 — sending. The quota (FR-13.2) is counted inside the same
   * transaction as the state change, because two tabs submitting at once would
   * both pass a check made outside one.
   */
  submit: protectedProcedure
    .input(
      z.object({
        suggestionId: z.string().min(1),
        note: suggestionNoteSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const suggestion = await requireOwnDraft(ctx, input.suggestionId)
      const { request } = suggestion
      const userId = ctx.session.user.id

      // FR-13.1 — word bounds, enforced server-side as well as in the composer.
      if (suggestion.wordCount < request.minWords || suggestion.wordCount > request.maxWords) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `This request asks for between ${String(request.minWords)} and ${String(request.maxWords)} words. Yours is ${String(suggestion.wordCount)}.`,
        })
      }

      // FR-13.3 — ten a day.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const sentToday = await ctx.db.suggestion.count({
        where: { contributorId: userId, submittedAt: { gte: since } },
      })
      if (sentToday >= DAILY_LIMITS.suggestionsSent) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `You can send ${String(DAILY_LIMITS.suggestionsSent)} suggestions a day. Try again tomorrow.`,
        })
      }

      const storyboard = await loadStoryboard(
        ctx.db,
        { id: userId },
        {
          id: request.storyboardId,
        },
      )
      // FR-13.2 — owners and co-authors are exempt on their own storyboards.
      const exempt = isAuthor({ id: userId }, storyboard.resource)

      const result = await ctx.db.$transaction(async (tx) => {
        if (!exempt) {
          const held = await tx.suggestion.count({
            where: {
              contributorId: userId,
              state: 'SUBMITTED',
              request: { storyboardId: request.storyboardId },
            },
          })
          if (held >= SUGGESTION_QUOTA_PER_STORYBOARD) {
            throw new TRPCError({
              code: 'TOO_MANY_REQUESTS',
              message: `You can have ${String(SUGGESTION_QUOTA_PER_STORYBOARD)} suggestions waiting on this storyboard at once. Wait for a decision, or withdraw one.`,
            })
          }
        }

        const updated = await tx.suggestion.update({
          where: { id: suggestion.id },
          data: { state: 'SUBMITTED', submittedAt: new Date(), note: input.note ?? null },
          select: { id: true, publicId: true, state: true },
        })

        // FR-5.9 — a request with an undecided suggestion is `answered`.
        await tx.contributionRequest.updateMany({
          where: { id: request.id, state: 'OPEN' },
          data: { state: 'ANSWERED' },
        })

        return updated
      })

      await notifyAuthors(ctx.db, request.storyboardId, 'SUGGESTION_RECEIVED', {
        requestId: request.id,
        suggestionId: suggestion.id,
      })
      await recordActivity(ctx.db, userId)

      log.info(
        { event: 'suggestion.submit', suggestionId: suggestion.id, requestId: request.id, userId },
        'suggestion sent',
      )
      return result
    }),

  /** FR-6.5 — withdraw before a decision. Frees a quota slot. */
  withdraw: protectedProcedure
    .input(z.object({ suggestionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const suggestion = await ctx.db.suggestion.findUnique({
        where: { id: input.suggestionId },
        select: { id: true, contributorId: true, state: true, requestId: true },
      })
      if (suggestion?.contributorId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }
      if (suggestion.state !== 'SUBMITTED' && suggestion.state !== 'STALE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only a suggestion that is still waiting can be withdrawn.',
        })
      }

      const updated = await ctx.db.suggestion.update({
        where: { id: suggestion.id },
        data: { state: 'WITHDRAWN' },
        select: { id: true, state: true },
      })
      log.info({ event: 'suggestion.withdraw', suggestionId: suggestion.id, userId }, 'withdrawn')
      return updated
    }),

  /** One suggestion, with its prose. Public so a passed one stays readable (FR-6.11). */
  get: publicProcedure
    .input(z.object({ publicId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const suggestion = await ctx.db.suggestion.findUnique({
        where: { publicId: input.publicId },
        select: {
          id: true,
          publicId: true,
          state: true,
          note: true,
          wordCount: true,
          contentJson: true,
          contentText: true,
          passReason: true,
          submittedAt: true,
          decidedAt: true,
          baseRevisionId: true,
          contributor: { select: { id: true, username: true, displayName: true } },
          decidedBy: { select: { id: true, username: true, displayName: true } },
          request: {
            select: {
              id: true,
              publicId: true,
              title: true,
              kind: true,
              minWords: true,
              maxWords: true,
              storyboardId: true,
              sectionId: true,
              section: { select: { id: true, currentRevisionId: true, title: true } },
              storyboard: { select: { slug: true, title: true, type: true } },
            },
          },
        },
      })
      if (!suggestion) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }

      const actor = actorFrom(ctx.session)
      const { permissions } = await loadStoryboard(ctx.db, actor, {
        id: suggestion.request.storyboardId,
      })

      // A draft is nobody's business but its author's.
      if (suggestion.state === 'DRAFT' && suggestion.contributor.id !== actor?.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }

      const isStale =
        suggestion.state === 'SUBMITTED' &&
        suggestion.request.section.currentRevisionId !== suggestion.baseRevisionId

      return { suggestion, permissions, isStale }
    }),

  /**
   * FR-6.6, FR-6.7 and FR-8.1 — the only place in the product where
   * concurrency genuinely matters, implemented exactly as architecture
   * section 6.1 specifies.
   *
   * One serialisable transaction: lock the section row, refuse if the head has
   * moved since the suggestion was written, write the new revision with the
   * *contributor* as author and the deciding author as acceptor, mark every
   * other waiting suggestion stale, create the credit, resolve the request.
   *
   * Notifications go after the transaction, never inside it.
   */
  accept: protectedProcedure
    .input(
      z.object({
        suggestionId: z.string().min(1),
        /** The author has seen that the section moved and wants it anyway. */
        acknowledgedChange: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      const suggestion = await ctx.db.suggestion.findUnique({
        where: { id: input.suggestionId },
        select: {
          id: true,
          state: true,
          contributorId: true,
          baseRevisionId: true,
          contentJson: true,
          contentText: true,
          wordCount: true,
          request: {
            select: {
              id: true,
              storyboardId: true,
              sectionId: true,
              section: { select: { lineageId: true } },
            },
          },
        },
      })
      if (!suggestion) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }

      await loadStoryboard(
        ctx.db,
        actor,
        { id: suggestion.request.storyboardId },
        'suggestion:decide',
      )

      if (suggestion.state !== 'SUBMITTED' && suggestion.state !== 'STALE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That suggestion has already been decided.',
        })
      }

      const deciderId = ctx.session.user.id
      const { sectionId, id: requestId } = suggestion.request
      const derived = {
        contentText: suggestion.contentText,
        wordCount: suggestion.wordCount,
      }

      const accepted = await ctx.db.$transaction(
        async (tx) => {
          // Row lock: two acceptances on the same section serialise here rather
          // than both writing a revision.
          const locked = await tx.$queryRaw<Array<{ currentRevisionId: string | null }>>`
            select "currentRevisionId" from "Section" where id = ${sectionId} for update
          `
          const head = locked[0]?.currentRevisionId ?? null

          if (head !== suggestion.baseRevisionId && !input.acknowledgedChange) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'This section changed a moment ago. Look at it again before deciding.',
            })
          }

          const revision = await tx.revision.create({
            data: {
              sectionId,
              parentId: head,
              contentJson: suggestion.contentJson ?? {},
              contentText: derived.contentText,
              wordCount: derived.wordCount,
              contentHash: hashContent(derived.contentText),
              source: 'ACCEPTED',
              // FR-8.1 — the contributor wrote the words; the author let them in.
              authorId: suggestion.contributorId,
              acceptedById: deciderId,
              suggestionId: suggestion.id,
            },
            select: { id: true },
          })

          await tx.section.update({
            where: { id: sectionId },
            data: { currentRevisionId: revision.id, wordCount: derived.wordCount },
          })

          await tx.suggestion.update({
            where: { id: suggestion.id },
            data: { state: 'ACCEPTED', decidedAt: new Date(), decidedById: deciderId },
          })

          // FR-6.7 — everything else waiting on this request is now written
          // against a head that has moved.
          await tx.suggestion.updateMany({
            where: { requestId, state: 'SUBMITTED', id: { not: suggestion.id } },
            data: { state: 'STALE' },
          })

          // FR-9.1 — permanent, and it survives the text being replaced later.
          await tx.credit.create({
            data: {
              storyboardId: suggestion.request.storyboardId,
              contributorId: suggestion.contributorId,
              type: 'PROSE',
              sectionLineage: suggestion.request.section.lineageId,
              revisionId: revision.id,
              suggestionId: suggestion.id,
              isLive: true,
            },
          })

          await tx.contributionRequest.update({
            where: { id: requestId },
            data: { state: 'RESOLVED', resolvedAt: new Date() },
          })

          return { revisionId: revision.id }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )

      // After the transaction, never inside it.
      const staled = await ctx.db.suggestion.findMany({
        where: { requestId, state: 'STALE' },
        select: { id: true, contributorId: true },
      })
      await ctx.db.notification.createMany({
        data: [
          {
            userId: suggestion.contributorId,
            type: 'SUGGESTION_ACCEPTED' as const,
            payload: { suggestionId: suggestion.id, requestId },
          },
          ...staled.map((entry) => ({
            userId: entry.contributorId,
            type: 'SUGGESTION_STALE' as const,
            payload: { suggestionId: entry.id, requestId },
          })),
        ],
      })

      // Both people did something: one wrote it, one decided on it.
      await recordActivityFor(ctx.db, [suggestion.contributorId, deciderId])

      log.info(
        {
          event: 'suggestion.accepted',
          suggestionId: suggestion.id,
          requestId,
          contributorId: suggestion.contributorId,
          deciderId,
          revisionId: accepted.revisionId,
        },
        'suggestion accepted',
      )
      return accepted
    }),

  /**
   * FR-6.10 — passing needs no written reason. An optional chip from a fixed
   * set, chosen in one click, and no free-text field anywhere.
   */
  pass: protectedProcedure
    .input(
      z.object({
        suggestionId: z.string().min(1),
        reason: passChipSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      const suggestion = await ctx.db.suggestion.findUnique({
        where: { id: input.suggestionId },
        select: {
          id: true,
          state: true,
          contributorId: true,
          request: { select: { id: true, storyboardId: true } },
        },
      })
      if (!suggestion) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }
      await loadStoryboard(
        ctx.db,
        actor,
        { id: suggestion.request.storyboardId },
        'suggestion:decide',
      )
      if (suggestion.state !== 'SUBMITTED' && suggestion.state !== 'STALE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That suggestion has already been decided.',
        })
      }

      const updated = await ctx.db.suggestion.update({
        where: { id: suggestion.id },
        data: {
          state: 'PASSED',
          passReason: input.reason ?? null,
          decidedAt: new Date(),
          decidedById: ctx.session.user.id,
        },
        select: { id: true, state: true, passReason: true },
      })

      // FR-5.9 — if nothing is waiting any more, the request is open again.
      const stillWaiting = await ctx.db.suggestion.count({
        where: { requestId: suggestion.request.id, state: { in: ['SUBMITTED', 'STALE'] } },
      })
      if (stillWaiting === 0) {
        await ctx.db.contributionRequest.updateMany({
          where: { id: suggestion.request.id, state: 'ANSWERED' },
          data: { state: 'OPEN' },
        })
      }

      // FR-6.10 — information, not a verdict. The wording lives in the template.
      await ctx.db.notification.create({
        data: {
          userId: suggestion.contributorId,
          type: 'SUGGESTION_PASSED',
          payload: { suggestionId: suggestion.id, requestId: suggestion.request.id },
        },
      })

      await recordActivity(ctx.db, ctx.session.user.id)

      log.info(
        { event: 'suggestion.passed', suggestionId: suggestion.id, reason: input.reason ?? null },
        'suggestion passed',
      )
      return updated
    }),

  /**
   * FR-6.7 — a stale suggestion can be revised against the new text and sent
   * again without consuming additional quota. Re-anchoring is the whole of it:
   * the suggestion goes back to being a draft, pointed at the current head.
   */
  rebase: protectedProcedure
    .input(z.object({ suggestionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const suggestion = await ctx.db.suggestion.findUnique({
        where: { id: input.suggestionId },
        select: {
          id: true,
          state: true,
          contributorId: true,
          request: { select: { section: { select: { currentRevisionId: true } } } },
        },
      })
      if (suggestion?.contributorId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }
      if (suggestion.state !== 'STALE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That suggestion is already up to date.',
        })
      }

      const head = suggestion.request.section.currentRevisionId
      if (!head) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That section has no text.' })
      }

      const updated = await ctx.db.suggestion.update({
        where: { id: suggestion.id },
        data: { state: 'DRAFT', baseRevisionId: head, submittedAt: null },
        select: { id: true, publicId: true, state: true, baseRevisionId: true },
      })
      log.info({ event: 'suggestion.rebase', suggestionId: suggestion.id, userId }, 'rebased')
      return updated
    }),

  /** Everything this person has written, for their profile (FR-6.11, FR-9.4). */
  listMine: protectedProcedure.query(({ ctx }) =>
    ctx.db.suggestion.findMany({
      where: { contributorId: ctx.session.user.id, state: { not: 'DRAFT' } },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        publicId: true,
        state: true,
        wordCount: true,
        submittedAt: true,
        passReason: true,
        request: {
          select: {
            title: true,
            publicId: true,
            storyboard: { select: { slug: true, title: true } },
          },
        },
      },
    }),
  ),
})

/** A draft the signed-in user owns, with its request. */
async function requireOwnDraft(
  ctx: { db: PrismaClient; session: { user: { id: string } } },
  suggestionId: string,
) {
  const suggestion = await ctx.db.suggestion.findUnique({
    where: { id: suggestionId },
    select: {
      id: true,
      contributorId: true,
      state: true,
      wordCount: true,
      request: {
        select: { id: true, storyboardId: true, minWords: true, maxWords: true, state: true },
      },
    },
  })
  if (suggestion?.contributorId !== ctx.session.user.id) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
  }
  if (suggestion.state !== 'DRAFT') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'That suggestion has already been sent.',
    })
  }
  return suggestion
}

/** In-app rows for the owner and every co-author (FR-12.1; email is phase 3). */
async function notifyAuthors(
  db: PrismaClient,
  storyboardId: string,
  type: 'SUGGESTION_RECEIVED' | 'IDEA_RECEIVED',
  payload: Record<string, string>,
): Promise<void> {
  const storyboard = await db.storyboard.findUnique({
    where: { id: storyboardId },
    select: {
      ownerId: true,
      collaborators: { where: { acceptedAt: { not: null } }, select: { userId: true } },
    },
  })
  if (!storyboard) return

  const recipients = [storyboard.ownerId, ...storyboard.collaborators.map((c) => c.userId)]
  await db.notification.createMany({
    data: recipients.map((userId) => ({ userId, type, payload })),
  })
}
