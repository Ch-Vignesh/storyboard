import type { Prisma, PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadSection, loadStoryboard, visibleStoryboardsWhere } from '@/lib/authz/guard'
import { recordActivity } from '@/server/activity'
import { publicId } from '@/lib/ids'
import { logger } from '@/lib/logger'
import { CONTINUE_TARGET_MAX_WORDS, REWRITE_TARGET_MIN_WORDS } from '@/lib/schemas/constants'
import { createRequestSchema, passChipSchema, PROSE_KINDS } from '@/lib/schemas/help'

import { actorFrom, createTRPCRouter, protectedProcedure, publicProcedure } from '../init'

const log = logger.child({ router: 'request' })

/** Everything a request page needs, in one shape. */
const REQUEST_SELECT = {
  id: true,
  publicId: true,
  kind: true,
  title: true,
  ask: true,
  preContext: true,
  toneNotes: true,
  constraints: true,
  readingList: true,
  minWords: true,
  maxWords: true,
  state: true,
  createdAt: true,
  closedAt: true,
  storyboardId: true,
  sectionId: true,
  openedBy: { select: { id: true, username: true, displayName: true } },
  section: {
    select: {
      id: true,
      title: true,
      order: true,
      wordCount: true,
      lineageId: true,
      currentRevisionId: true,
      chapter: { select: { id: true, title: true, order: true } },
    },
  },
  storyboard: { select: { id: true, slug: true, title: true, type: true } },
} satisfies Prisma.ContributionRequestSelect

export const requestRouter = createTRPCRouter({
  /**
   * FR-5.1 — opened on exactly one section by an owner or co-author, and at
   * most one open request per section. The partial unique index in the
   * invariants migration is the real guard; the check here exists to turn a
   * constraint violation into a sentence a writer can act on.
   *
   * FR-5.7 — a rewrite needs something to rewrite, a continue needs somewhere
   * to continue into. Both enforced here with a plain-language error.
   */
  create: protectedProcedure.input(createRequestSchema).mutation(async ({ ctx, input }) => {
    const actor = actorFrom(ctx.session, ctx.account)
    const { sectionId, storyboardId, wordCount } = await loadSection(
      ctx.db,
      actor,
      input.sectionId,
      'request:open',
    )

    // FR-5.7
    if (input.kind === 'REWRITE' && wordCount < REWRITE_TARGET_MIN_WORDS) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `There is not much here to rewrite yet. A section needs at least ${String(REWRITE_TARGET_MIN_WORDS)} words before you can ask someone to rewrite it — ask for what comes next instead.`,
      })
    }
    if (input.kind === 'CONTINUE' && wordCount > CONTINUE_TARGET_MAX_WORDS) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `This section already has ${String(wordCount)} words. Asking someone to continue works best from an empty or barely started section — ask for a rewrite instead.`,
      })
    }

    const open = await ctx.db.contributionRequest.findFirst({
      where: { sectionId, state: { in: ['OPEN', 'ANSWERED'] } },
      select: { id: true },
    })
    if (open) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This section is already open for help. Close that one first.',
      })
    }

    const created = await ctx.db.contributionRequest.create({
      data: {
        publicId: publicId(),
        storyboardId,
        sectionId,
        kind: input.kind,
        title: input.title,
        ask: input.ask,
        // FR-5.4 is meaningless for UNBLOCK, so it is not stored for one.
        preContext: PROSE_KINDS.includes(input.kind) ? (input.preContext ?? null) : null,
        toneNotes: input.toneNotes ?? null,
        constraints: input.constraints ?? [],
        readingList: input.readingList ?? [],
        minWords: input.minWords,
        maxWords: input.maxWords,
        openedById: ctx.session.user.id,
      },
      select: { id: true, publicId: true },
    })

    // Opening a request is work: it is how an author asks for help (FR-9.3).
    await recordActivity(ctx.db, ctx.session.user.id)

    log.info(
      { event: 'request.open', requestId: created.id, storyboardId, kind: input.kind },
      'request opened',
    )
    return created
  }),

  /** The request page (screen 8). Public: a guest may read one (FR-1.2). */
  get: publicProcedure
    .input(z.object({ publicId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.contributionRequest.findUnique({
        where: { publicId: input.publicId },
        select: REQUEST_SELECT,
      })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'That request does not exist.' })

      const actor = actorFrom(ctx.session, ctx.account)
      const { permissions } = await loadStoryboard(ctx.db, actor, { id: row.storyboardId })

      // FR-5.5 — the reading list renders inline, in order, never as links that
      // navigate away. Resolve the lineage ids to their current text here so
      // the page can lay them out without a second round trip.
      const lineageIds = Array.isArray(row.readingList) ? (row.readingList as string[]) : []
      const reading =
        lineageIds.length > 0
          ? await ctx.db.section.findMany({
              where: {
                lineageId: { in: lineageIds },
                deletedAt: null,
                chapter: { version: { storyboardId: row.storyboardId, isMain: true } },
              },
              select: {
                lineageId: true,
                title: true,
                order: true,
                chapter: { select: { title: true, order: true } },
                currentRevision: { select: { contentJson: true, wordCount: true } },
              },
            })
          : []

      // Keep the author's ordering rather than the database's.
      const readingList = lineageIds
        .map((lineageId) => reading.find((section) => section.lineageId === lineageId))
        .filter((section) => section !== undefined)

      const suggestions = await ctx.db.suggestion.findMany({
        where: {
          requestId: row.id,
          // Drafts are private to their author until sent (FR-6.1).
          OR: [
            { state: { in: ['SUBMITTED', 'ACCEPTED', 'PASSED', 'STALE'] } },
            ...(actor ? [{ contributorId: actor.id }] : []),
          ],
        },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          publicId: true,
          state: true,
          note: true,
          wordCount: true,
          passReason: true,
          submittedAt: true,
          decidedAt: true,
          baseRevisionId: true,
          contributor: { select: { id: true, username: true, displayName: true } },
        },
      })

      const ideas = await ctx.db.idea.findMany({
        where: { requestId: row.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          parentId: true,
          markedHelpful: true,
          createdAt: true,
          author: { select: { id: true, username: true, displayName: true } },
        },
      })

      return {
        request: { ...row, constraints: asStringArray(row.constraints) },
        readingList,
        suggestions,
        ideas,
        permissions,
        /** FR-6.9 with OD-5: one idea per request may be marked (decision 0010). */
        hasHelpfulIdea: ideas.some((idea) => idea.markedHelpful),
      }
    }),

  /** Open requests on one storyboard, for the reader's margin (FR-11.5). */
  listForStoryboard: publicProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId } = await loadStoryboard(ctx.db, actor, { id: input.storyboardId })

      return ctx.db.contributionRequest.findMany({
        where: { storyboardId, state: { in: ['OPEN', 'ANSWERED'] } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          publicId: true,
          kind: true,
          title: true,
          state: true,
          sectionId: true,
          minWords: true,
          maxWords: true,
          createdAt: true,
          _count: { select: { suggestions: true, ideas: true } },
        },
      })
    }),

  /**
   * Open requests across the platform, newest first. The dashboard's third
   * region filters this by the reader's pinned genres (FR-11.1, FR-11.2).
   */
  listOpen: publicProcedure
    .input(
      z
        .object({
          genreIds: z.array(z.string().min(1)).max(24).optional(),
          take: z.number().int().min(1).max(50).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      return ctx.db.contributionRequest.findMany({
        where: {
          state: { in: ['OPEN', 'ANSWERED'] },
          storyboard: {
            ...visibleStoryboardsWhere(actor),
            visibility: 'PUBLIC',
            ...(input?.genreIds?.length
              ? { genres: { some: { genreId: { in: input.genreIds } } } }
              : {}),
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input?.take ?? 20,
        select: {
          id: true,
          publicId: true,
          kind: true,
          title: true,
          ask: true,
          state: true,
          minWords: true,
          maxWords: true,
          createdAt: true,
          storyboard: {
            select: {
              slug: true,
              title: true,
              type: true,
              isSeed: true,
              owner: { select: { username: true, displayName: true } },
              genres: { select: { genre: { select: { id: true, name: true } } } },
            },
          },
          _count: { select: { suggestions: true, ideas: true } },
        },
      })
    }),

  /**
   * FR-11.1 region two: requests you have helped with that have news.
   *
   * "News" is a decision on your own work, or movement under it: your
   * suggestion was accepted or passed, it went stale, or your idea was
   * credited. A request you sent something to that has simply gone quiet is not
   * news, and putting it here would make the region a list of things to feel
   * bad about.
   */
  withNews: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const suggestions = await ctx.db.suggestion.findMany({
      where: {
        contributorId: userId,
        state: { in: ['ACCEPTED', 'PASSED', 'STALE'] },
        request: { storyboard: { deletedAt: null } },
      },
      orderBy: [{ decidedAt: 'desc' }, { submittedAt: 'desc' }],
      take: 12,
      select: {
        id: true,
        publicId: true,
        state: true,
        passReason: true,
        decidedAt: true,
        submittedAt: true,
        request: {
          select: {
            publicId: true,
            title: true,
            storyboard: { select: { slug: true, title: true } },
          },
        },
      },
    })

    const ideas = await ctx.db.idea.findMany({
      where: {
        authorId: userId,
        markedHelpful: true,
        request: { storyboard: { deletedAt: null } },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        createdAt: true,
        request: {
          select: {
            publicId: true,
            title: true,
            storyboard: { select: { slug: true, title: true } },
          },
        },
      },
    })

    return { suggestions, ideas }
  }),

  /** FR-5.10 — closing does not delete the suggestions; they stay readable. */
  close: protectedProcedure
    .input(z.object({ requestId: z.string().min(1), reason: passChipSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const { request } = await requireAuthorOfRequest(ctx, input.requestId)

      const updated = await ctx.db.contributionRequest.update({
        where: { id: request.id },
        data: { state: 'CLOSED', closedAt: new Date() },
        select: { id: true, state: true },
      })
      log.info({ event: 'request.close', requestId: request.id }, 'request closed')
      return updated
    }),

  /** FR-5.9 — reopening notifies everyone who has ever submitted to it. */
  reopen: protectedProcedure
    .input(z.object({ requestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { request } = await requireAuthorOfRequest(ctx, input.requestId)

      const clash = await ctx.db.contributionRequest.findFirst({
        where: {
          sectionId: request.sectionId,
          state: { in: ['OPEN', 'ANSWERED'] },
          id: { not: request.id },
        },
        select: { id: true },
      })
      if (clash) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This section already has another request open.',
        })
      }

      const submitted = await ctx.db.suggestion.count({
        where: { requestId: request.id, state: 'SUBMITTED' },
      })

      const updated = await ctx.db.contributionRequest.update({
        where: { id: request.id },
        data: {
          state: submitted > 0 ? 'ANSWERED' : 'OPEN',
          closedAt: null,
          resolvedAt: null,
        },
        select: { id: true, state: true },
      })

      const everyone = await ctx.db.suggestion.findMany({
        where: { requestId: request.id },
        distinct: ['contributorId'],
        select: { contributorId: true },
      })
      await ctx.db.notification.createMany({
        data: everyone.map((entry) => ({
          userId: entry.contributorId,
          type: 'SUGGESTION_STALE' as const,
          payload: { requestId: request.id, reason: 'reopened' },
        })),
      })

      log.info({ event: 'request.reopen', requestId: request.id }, 'request reopened')
      return updated
    }),
})

function asStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

/** Loads a request and asserts the actor may decide on it (owner or co-author). */
async function requireAuthorOfRequest(
  ctx: { db: PrismaClient; session: { user: { id: string } } | null },
  requestId: string,
) {
  const request = await ctx.db.contributionRequest.findUnique({
    where: { id: requestId },
    select: { id: true, storyboardId: true, sectionId: true, state: true },
  })
  if (!request) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'That request does not exist.' })
  }
  const actor = ctx.session?.user ? { id: ctx.session.user.id } : null
  const storyboard = await loadStoryboard(
    ctx.db,
    actor,
    { id: request.storyboardId },
    'suggestion:decide',
  )
  return { request, storyboard }
}
