import type { Prisma } from '@storyboard/db'
import { z } from 'zod'

import { visibleStoryboardsWhere } from '@/lib/authz/guard'
import { AGE_FILTERS, browseFiltersSchema } from '@/lib/schemas/browse'
import { QUIET_REQUEST_NUDGE_DAYS } from '@/lib/schemas/constants'

import { actorFrom, createTRPCRouter, publicProcedure } from '../init'

/**
 * Discovery (FR-11.3, FR-11.4, FR-11.6).
 *
 * Every filter here is a fact about the request, and every sort is a rule that
 * can be said in a sentence. There is no ranking model and no relevance score:
 * FR-11.2 says pinned genres drive the dashboard and nothing else, and this is
 * the other half of that promise.
 */
export const browseRouter = createTRPCRouter({
  requests: publicProcedure.input(browseFiltersSchema).query(async ({ ctx, input }) => {
    const actor = actorFrom(ctx.session, ctx.account)
    const age = AGE_FILTERS.find((entry) => entry.value === input.age)

    const where: Prisma.ContributionRequestWhereInput = {
      state: { in: ['OPEN', 'ANSWERED'] },
      ...(input.kinds?.length ? { kind: { in: input.kinds } } : {}),
      // FR-5.8's bounds are what a helper is being asked for, so filtering on
      // them is filtering on "is this a job I want".
      ...(input.minWords !== undefined ? { maxWords: { gte: input.minWords } } : {}),
      ...(input.maxWords !== undefined ? { minWords: { lte: input.maxWords } } : {}),
      ...(age?.days
        ? { createdAt: { gte: new Date(Date.now() - age.days * 24 * 60 * 60 * 1000) } }
        : {}),
      storyboard: {
        ...visibleStoryboardsWhere(actor),
        visibility: 'PUBLIC',
        ...(input.genreIds?.length
          ? { genres: { some: { genreId: { in: input.genreIds } } } }
          : {}),
        ...(input.types?.length ? { type: { in: input.types } } : {}),
        // FR-11.6 — title and author name. Nothing reaches into the prose.
        ...(input.query
          ? {
              OR: [
                { title: { contains: input.query, mode: 'insensitive' } },
                { owner: { username: { contains: input.query, mode: 'insensitive' } } },
                { owner: { displayName: { contains: input.query, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      // "No answers yet" is a filter as well as a sort: a request with
      // nothing on it is the one most worth showing to a helper.
      ...(input.sort === 'NO_ANSWERS' ? { suggestions: { none: {} }, ideas: { none: {} } } : {}),
    }

    const orderBy: Prisma.ContributionRequestOrderByWithRelationInput =
      input.sort === 'CLOSING_SOON' || input.sort === 'NO_ANSWERS'
        ? { createdAt: 'asc' }
        : { createdAt: 'desc' }

    const requests = await ctx.db.contributionRequest.findMany({
      where,
      orderBy,
      take: input.take,
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

    const nudgeAt = Date.now() - QUIET_REQUEST_NUDGE_DAYS * 24 * 60 * 60 * 1000
    return {
      requests: requests.map((request) => ({
        ...request,
        /** FR-12.4 — past this, the author gets nudged. Shown as context, not a score. */
        quiet:
          request._count.suggestions + request._count.ideas === 0 &&
          request.createdAt.getTime() < nudgeAt,
      })),
    }
  }),

  /**
   * FR-11.4 — a storyboard card shows title, author, type, genres, word count
   * and a badge with the number of sections open for help. The badge is the
   * primary call to action, not the title, so the count is not an afterthought
   * here: it is the reason the card exists.
   */
  storyboards: publicProcedure
    .input(
      z.object({
        query: z.string().trim().max(100).optional(),
        genreIds: z.array(z.string().min(1)).max(24).optional(),
        take: z.number().int().min(1).max(50).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)

      const rows = await ctx.db.storyboard.findMany({
        where: {
          ...visibleStoryboardsWhere(actor),
          visibility: 'PUBLIC',
          ...(input.genreIds?.length
            ? { genres: { some: { genreId: { in: input.genreIds } } } }
            : {}),
          ...(input.query
            ? {
                OR: [
                  { title: { contains: input.query, mode: 'insensitive' } },
                  { owner: { username: { contains: input.query, mode: 'insensitive' } } },
                  { owner: { displayName: { contains: input.query, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input.take,
        select: {
          id: true,
          slug: true,
          title: true,
          logline: true,
          type: true,
          isSeed: true,
          owner: { select: { username: true, displayName: true } },
          genres: { select: { genre: { select: { id: true, name: true } } } },
          requests: {
            where: { state: { in: ['OPEN', 'ANSWERED'] } },
            select: { id: true },
          },
          versions: {
            where: { isMain: true },
            select: {
              chapters: {
                where: { deletedAt: null },
                select: {
                  sections: {
                    where: { deletedAt: null, mergedIntoId: null },
                    select: { wordCount: true },
                  },
                },
              },
            },
          },
        },
      })

      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        logline: row.logline,
        type: row.type,
        isSeed: row.isSeed,
        owner: row.owner,
        genres: row.genres.map((entry) => entry.genre),
        openRequests: row.requests.length,
        wordCount:
          row.versions[0]?.chapters.reduce(
            (total, chapter) =>
              total + chapter.sections.reduce((sum, section) => sum + section.wordCount, 0),
            0,
          ) ?? 0,
      }))
    }),
})
