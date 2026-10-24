import type { Prisma } from '@storyboard/db'
import { z } from 'zod'

import { visibleStoryboardsWhere } from '@/lib/authz/guard'
import {
  AGE_FILTERS,
  browseCursorSchema,
  browseFiltersSchema,
  type BrowseCursor,
} from '@/lib/schemas/browse'
import { ANSWERS, AUTHORS_SELECT, withIdeaAnswers } from '@/server/answers'
import {
  BROWSE_LIMITS,
  GENRE_SELECTION_MAX,
  QUIET_REQUEST_NUDGE_DAYS,
} from '@/lib/schemas/constants'

import { actorFrom, createTRPCRouter, publicProcedure } from '../init'

/** Item 9.1 — the browse filters, and where "Show more" carries on from. */
const requestsInput = browseFiltersSchema.extend({ cursor: browseCursorSchema })

/**
 * Item 9.1 — past the cursor, in the list's own order: further along by date,
 * or on the same date and further along by id, which is how the order breaks
 * a tie. Newest first, further along is earlier; oldest first, later.
 */
function past(cursor: NonNullable<BrowseCursor>, newestFirst: boolean) {
  return newestFirst
    ? { date: { lt: cursor.at }, same: cursor.at, id: { lt: cursor.id } }
    : { date: { gt: cursor.at }, same: cursor.at, id: { gt: cursor.id } }
}

/** FR-11.6 — a story by its title or its author's name; nothing reaches into the prose. */
function matchingTitleOrAuthor(query: string): Prisma.StoryboardWhereInput {
  return {
    OR: [
      { title: { contains: query, mode: 'insensitive' } },
      { owner: { username: { contains: query, mode: 'insensitive' } } },
      { owner: { displayName: { contains: query, mode: 'insensitive' } } },
    ],
  }
}

/**
 * Discovery (FR-11.3, FR-11.4, FR-11.6).
 *
 * Every filter here is a fact about the request, and every sort is a rule that
 * can be said in a sentence. There is no ranking model and no relevance score:
 * FR-11.2 says pinned genres drive the dashboard and nothing else, and this is
 * the other half of that promise.
 *
 * Item 9.1 — both lists come a page at a time, each page with the count of
 * everything the filters match ("Showing 24 of 57") and where the next page
 * starts. A list that stopped at its first page was a list that lied about
 * how many people were stuck.
 */
export const browseRouter = createTRPCRouter({
  requests: publicProcedure.input(requestsInput).query(async ({ ctx, input }) => {
    const actor = actorFrom(ctx.session, ctx.account)
    const age = AGE_FILTERS.find((entry) => entry.value === input.age)

    const where: Prisma.ContributionRequestWhereInput = {
      state: { in: ['OPEN', 'ANSWERED'] },
      ...(input.kinds?.length ? { kind: { in: input.kinds } } : {}),
      // FR-5.8's bounds are what a helper is being asked for, so filtering on
      // them is filtering on "is this a job I want".
      ...(input.minWords !== undefined ? { maxWords: { gte: input.minWords } } : {}),
      ...(input.maxWords !== undefined ? { minWords: { lte: input.maxWords } } : {}),
      // Item 9.1 — "this week" is opened this week, as the card says it was
      // (item 6.15's `openedAt`: opened, or opened again).
      ...(age?.days
        ? { openedAt: { gte: new Date(Date.now() - age.days * 24 * 60 * 60 * 1000) } }
        : {}),
      storyboard: {
        // Each part its own term: the visibility filter carries an `OR` of its
        // own for a signed-in reader, and a search spread beside it used to
        // replace it, which showed a hidden story's requests to anyone who
        // searched for its title (found in item 9.1).
        AND: [
          visibleStoryboardsWhere(actor),
          {
            visibility: 'PUBLIC',
            // FR-14.1 — finishing closes a story's requests and nothing can open
            // one since; this is the second lock on the same door.
            state: { not: 'FINISHED' },
            ...(input.genreIds?.length
              ? { genres: { some: { genreId: { in: input.genreIds } } } }
              : {}),
            ...(input.types?.length ? { type: { in: input.types } } : {}),
          },
          // FR-11.6 — title and author name. Nothing reaches into the prose.
          ...(input.query ? [matchingTitleOrAuthor(input.query)] : []),
        ],
      },
      // "No answers yet" is a filter as well as a sort: a request with
      // nothing on it is the one most worth showing to a helper.
      // A "help me think" request's state carries its answers (item 1.12):
      // OPEN is "no idea from outside the story yet". A prose request takes
      // no ideas at all.
      ...(input.sort === 'NO_ANSWERS'
        ? {
            suggestions: { none: ANSWERS },
            AND: [{ OR: [{ kind: { not: 'UNBLOCK' as const } }, { state: 'OPEN' as const }] }],
          }
        : {}),
    }

    // Item 9.1 — in the order they were opened, which is the date each card
    // shows and the date each closes by (item 6.15); the id breaks a tie, so a
    // cursor is exact. Everything the filters match is counted beside it.
    const newestFirst = input.sort === 'RECENT'
    const direction = newestFirst ? 'desc' : 'asc'
    const from = input.cursor ? past(input.cursor, newestFirst) : null

    const rows = await ctx.db.contributionRequest.findMany({
      where: from
        ? { AND: [where, { OR: [{ openedAt: from.date }, { openedAt: from.same, id: from.id }] }] }
        : where,
      orderBy: [{ openedAt: direction }, { id: direction }],
      take: input.take + 1,
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
        openedAt: true,
        storyboard: {
          select: {
            slug: true,
            title: true,
            type: true,
            isSeed: true,
            owner: { select: { username: true, displayName: true } },
            genres: { select: { genre: { select: { id: true, name: true } } } },
            ...AUTHORS_SELECT,
          },
        },
        _count: { select: { suggestions: { where: ANSWERS } } },
        // Idea answers are counted in code (item 1.12): see `answers.ts`.
        ideas: { where: { parentId: null }, select: { authorId: true } },
      },
    })
    const requests = rows.slice(0, input.take)
    const last = requests.at(-1)
    const total = await ctx.db.contributionRequest.count({ where })

    const nudgeAt = Date.now() - QUIET_REQUEST_NUDGE_DAYS * 24 * 60 * 60 * 1000
    return {
      requests: requests.map((raw) => {
        const request = withIdeaAnswers(raw)
        return {
          ...request,
          /** FR-12.4 — past this, the author gets nudged. Shown as context, not a score. */
          quiet:
            request._count.suggestions + request._count.ideas === 0 &&
            request.createdAt.getTime() < nudgeAt,
        }
      }),
      /** Everything the filters match, not only this page (item 9.1). */
      total,
      nextCursor: rows.length > input.take && last ? { at: last.openedAt, id: last.id } : null,
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
        query: z.string().trim().max(BROWSE_LIMITS.queryMaxChars).optional(),
        genreIds: z.array(z.string().min(1)).max(GENRE_SELECTION_MAX).optional(),
        // FR-11.3 — the page's type filter never reached this query (item 1.17).
        types: browseFiltersSchema.shape.types,
        take: z.number().int().min(1).max(BROWSE_LIMITS.pageMax).default(BROWSE_LIMITS.pageDefault),
        // Item 9.1 — where "Show more" carries on from.
        cursor: browseCursorSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)

      // Each part its own term, as for requests above: a search must narrow
      // the visibility filter, never stand in for it.
      const where: Prisma.StoryboardWhereInput = {
        AND: [
          visibleStoryboardsWhere(actor),
          {
            visibility: 'PUBLIC',
            ...(input.genreIds?.length
              ? { genres: { some: { genreId: { in: input.genreIds } } } }
              : {}),
            ...(input.types?.length ? { type: { in: input.types } } : {}),
          },
          ...(input.query ? [matchingTitleOrAuthor(input.query)] : []),
        ],
      }
      // Item 9.1 — newest first, the id breaking a tie, and the whole counted.
      const from = input.cursor ? past(input.cursor, true) : null

      const rows = await ctx.db.storyboard.findMany({
        where: from
          ? {
              AND: [
                where,
                { OR: [{ createdAt: from.date }, { createdAt: from.same, id: from.id }] },
              ],
            }
          : where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.take + 1,
        select: {
          id: true,
          slug: true,
          title: true,
          logline: true,
          type: true,
          isSeed: true,
          // Item 7.6 — "last written on", and a finished story marked.
          state: true,
          lastWrittenAt: true,
          // Item 7b.3 (decision 0044) — its current edition, if it has one.
          publications: { orderBy: { number: 'desc' }, take: 1, select: { number: true } },
          createdAt: true,
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
      const page = rows.slice(0, input.take)
      const last = page.at(-1)
      const total = await ctx.db.storyboard.count({ where })

      return {
        storyboards: page.map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          logline: row.logline,
          type: row.type,
          isSeed: row.isSeed,
          state: row.state,
          lastWrittenAt: row.lastWrittenAt,
          edition: row.publications[0]?.number ?? null,
          owner: row.owner,
          genres: row.genres.map((entry) => entry.genre),
          openRequests: row.requests.length,
          wordCount:
            row.versions[0]?.chapters.reduce(
              (total, chapter) =>
                total + chapter.sections.reduce((sum, section) => sum + section.wordCount, 0),
              0,
            ) ?? 0,
        })),
        total,
        nextCursor: rows.length > input.take && last ? { at: last.createdAt, id: last.id } : null,
      }
    }),
})
