import { Prisma, type PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import {
  assertNotFinished,
  authoredStoryboardsWhere,
  blockedFromHelping,
  loadSection,
  loadStoryboard,
  visibleStoryboardsWhere,
} from '@/lib/authz/guard'
import { suggestionVisibilityWhere } from '@/lib/authz'
import { afterCommit } from '@/server/after-commit'
import {
  ANSWERS,
  AUTHORS_SELECT,
  authorsOf,
  ideaAnswerWhere,
  TOP_LEVEL_IDEAS,
  withIdeaAnswers,
} from '@/server/answers'
import { ERASED_PERSON, ERASED_RECORD, redactIdea, redactSuggestionLine } from '@/server/hidden'
import { closeRequest } from '@/server/close-requests'
import { requestImpact } from '@/server/impact'
import { excerpt } from '@/lib/excerpt'
import { publicId } from '@/lib/ids'
import { logger } from '@/lib/logger'
import {
  BROWSE_LIMITS,
  CONTINUE_TARGET_MAX_WORDS,
  DASHBOARD_NEWS,
  GENRE_SELECTION_MAX,
  MARGIN_ASK_CHARS,
  NEEDS_YOU,
  REQUEST_PRE_CONTEXT_WORDS,
  REWRITE_TARGET_MIN_WORDS,
} from '@/lib/schemas/constants'
import { mainDraftPlaces } from '@/server/places'
import {
  countWords,
  createRequestSchema,
  ideaChangeCutoff,
  PRE_CONTEXT_TOO_SHORT,
  PROSE_KINDS,
  updateRequestSchema,
} from '@/lib/schemas/help'

import {
  activeProcedure,
  actorFrom,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../init'

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
  characterNotes: true,
  constraints: true,
  readingList: true,
  minWords: true,
  maxWords: true,
  state: true,
  createdAt: true,
  /** Item 6.15 — when it was opened, or last opened again; "Closes on" counts from it. */
  openedAt: true,
  editedAt: true,
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
  storyboard: {
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      state: true,
      // Item 9.6 — whether a link preview may describe it, and a crawler index it.
      visibility: true,
      hiddenAt: true,
      ...AUTHORS_SELECT,
    },
  },
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
  create: activeProcedure.input(createRequestSchema).mutation(async ({ ctx, input }) => {
    const actor = actorFrom(ctx.session, ctx.account)
    const { sectionId, storyboardId, wordCount, resource, versionId } = await loadSection(
      ctx.db,
      actor,
      input.sectionId,
      'request:open',
    )
    assertNotFinished(resource)
    await assertInMainDraft(ctx.db, versionId)

    // FR-5.7
    if (input.kind === 'REWRITE' && wordCount < REWRITE_TARGET_MIN_WORDS) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `There is not much here to rewrite yet. A section needs at least ${String(REWRITE_TARGET_MIN_WORDS)} words before you can ask someone to rewrite it — ask for what comes next instead.`,
      })
    }
    // "Under", as FR-5.7 says: at exactly the bound a section qualified for
    // both kinds until the 2026-10-16 spec review.
    if (input.kind === 'CONTINUE' && wordCount >= CONTINUE_TARGET_MAX_WORDS) {
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

    const created = await unlessAlreadyOpen(
      'This section is already open for help. Close that one first.',
      () =>
        ctx.db.contributionRequest.create({
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
            characterNotes: input.characterNotes ?? null,
            constraints: input.constraints ?? [],
            readingList: input.readingList ?? [],
            minWords: input.minWords,
            maxWords: input.maxWords,
            openedById: ctx.session.user.id,
          },
          select: { id: true, publicId: true },
        }),
    )

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
      const { permissions, resource } = await loadStoryboard(ctx.db, actor, {
        id: row.storyboardId,
      })

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

      // Phase 14, item 7.2 — the passage's address, counted as the reader
      // counts, so "Read it in the story" opens at it. The stored `order`
      // stops matching the reading order once a chapter is removed; none if
      // the section has left the main draft.
      const place =
        (await mainDraftPlaces(ctx.db, row.storyboardId, [row.section.lineageId])).get(
          row.section.lineageId,
        ) ?? null

      const suggestions = await ctx.db.suggestion.findMany({
        where: {
          requestId: row.id,
          AND: [
            {
              // Drafts are private to their author until sent (FR-6.1).
              OR: [
                { state: { in: ['SUBMITTED', 'ACCEPTED', 'PASSED', 'STALE'] } },
                ...(actor ? [{ contributorId: actor.id }] : []),
              ],
            },
            // Decision 0007: what was sent while the story was private stays private.
            suggestionVisibilityWhere(actor, resource),
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
          hiddenAt: true,
          // Item 6.7 — the writer may change it until an author opens it.
          openedAt: true,
          editedAt: true,
          contributor: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: { select: { updatedAt: true } },
            },
          },
          // Decision 0013 — erased by its writer, it is shown without a name.
          credits: ERASED_RECORD,
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
          hiddenAt: true,
          createdAt: true,
          // Item 6.8 — changed, or removed, by its writer.
          editedAt: true,
          deletedAt: true,
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: { select: { updatedAt: true } },
            },
          },
          credits: ERASED_RECORD,
        },
      })

      // Decision 0046 (item 2.9) — someone an author blocked reads this page
      // and helps from nowhere on it; the buttons give way to a sentence.
      const blocked = await blockedFromHelping(ctx.db, actor, resource)
      // Item 6.8 — who may still change which idea, judged here by the same
      // cutoff the edit writes against, so the page never offers a stale "Change".
      const changeableAfter = ideaChangeCutoff()

      return {
        request: { ...row, constraints: asStringArray(row.constraints) },
        place,
        readingList,
        // Hidden after a report (item 2.7): read as removed by everyone but
        // the writer and a moderator.
        suggestions: suggestions.map(({ credits, ...suggestion }) =>
          redactSuggestionLine(
            credits.length > 0 ? { ...suggestion, contributor: { ...ERASED_PERSON } } : suggestion,
            actor,
          ),
        ),
        ideas: ideas.map(({ credits, ...idea }) => ({
          ...redactIdea(
            credits.length > 0 ? { ...idea, author: { ...ERASED_PERSON } } : idea,
            actor,
          ),
          // Item 6.8 — removed by its writer: the row stays in the thread and
          // its words are sent to nobody. The page only hid them, and they
          // were in its data for any reader (phase 14 final pass).
          ...(idea.deletedAt === null ? {} : { body: '' }),
          canChange:
            actor?.id === idea.author.id &&
            !idea.markedHelpful &&
            idea.deletedAt === null &&
            idea.hiddenAt === null &&
            idea.createdAt > changeableAfter,
        })),
        permissions: blocked
          ? { ...permissions, canSubmitSuggestion: false, canPostIdea: false }
          : permissions,
        blockedFromHelping: blocked,
        /** FR-6.9 with OD-5: one idea per request may be marked (decision 0010). */
        hasHelpfulIdea: ideas.some((idea) => idea.markedHelpful),
        /** The story's authors, whose own ideas cannot be the one that helped (item 1.7). */
        authorIds: ((authors) => [authors.ownerId, ...authors.coauthorIds])(
          authorsOf(row.storyboard),
        ),
      }
    }),

  /** Open requests on one storyboard, for the reader's margin (FR-11.5). */
  listForStoryboard: publicProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId } = await loadStoryboard(ctx.db, actor, { id: input.storyboardId })

      const rows = await ctx.db.contributionRequest.findMany({
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
          // Item 7.1 — the margin card carries the start of the ask.
          ask: true,
          _count: { select: { suggestions: { where: ANSWERS } } },
          // Idea answers are counted in code (item 1.12): see `answers.ts`.
          ideas: TOP_LEVEL_IDEAS,
          storyboard: { select: AUTHORS_SELECT },
        },
      })
      // Only its start travels: the reader's first response carries this list
      // (item 7.4), and a whole ask is up to five hundred words.
      return rows.map(withIdeaAnswers).map((row) => ({
        ...row,
        ask: excerpt(row.ask, MARGIN_ASK_CHARS),
      }))
    }),

  /**
   * Open requests across the platform, newest first. The dashboard's third
   * region filters this by the reader's pinned genres (FR-11.1, FR-11.2).
   */
  listOpen: publicProcedure
    .input(
      z
        .object({
          genreIds: z.array(z.string().min(1)).max(GENRE_SELECTION_MAX).optional(),
          take: z.number().int().min(1).max(BROWSE_LIMITS.pageMax).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const rows = await ctx.db.contributionRequest.findMany({
        where: {
          state: { in: ['OPEN', 'ANSWERED'] },
          storyboard: {
            ...visibleStoryboardsWhere(actor),
            visibility: 'PUBLIC',
            // FR-11.1 — other people's requests: the region is "open requests
            // in your genres", and it listed the viewer's own (item 1.17).
            ...(actor
              ? {
                  NOT: [
                    { ownerId: actor.id },
                    { collaborators: { some: { userId: actor.id, acceptedAt: { not: null } } } },
                  ],
                }
              : {}),
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
          ideas: TOP_LEVEL_IDEAS,
        },
      })
      return rows.map(withIdeaAnswers)
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
    const actor = actorFrom(ctx.session, ctx.account)

    const suggestions = await ctx.db.suggestion.findMany({
      where: {
        contributorId: userId,
        state: { in: ['ACCEPTED', 'PASSED', 'STALE'] },
        // Visible to them now, not only not deleted: a story that went private
        // since kept showing its new title here (phase 12 audit).
        request: { storyboard: visibleStoryboardsWhere(actor) },
      },
      orderBy: [{ decidedAt: 'desc' }, { submittedAt: 'desc' }],
      take: DASHBOARD_NEWS,
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
            storyboard: { select: { slug: true, title: true, isSeed: true } },
          },
        },
      },
    })

    const ideas = await ctx.db.idea.findMany({
      where: {
        authorId: userId,
        markedHelpful: true,
        // Visible to them now, not only not deleted: a story that went private
        // since kept showing its new title here (phase 12 audit).
        request: { storyboard: visibleStoryboardsWhere(actor) },
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
            storyboard: { select: { slug: true, title: true, isSeed: true } },
          },
        },
      },
    })

    return { suggestions, ideas }
  }),

  /**
   * FR-11.1 with the prototype (phase 14, item 6.14) — what needs an author's
   * hand: suggestions waiting for a decision on their stories, the one that
   * has waited longest first; and "help me think" requests that have ideas
   * and none yet marked as the one that helped. The dashboard leads with it,
   * and hides it when there is nothing, which for someone who writes nothing
   * here is always.
   */
  needsYou: protectedProcedure.query(async ({ ctx }) => {
    const mine = authoredStoryboardsWhere(ctx.session.user.id)

    const suggestions = await ctx.db.suggestion.findMany({
      where: {
        state: 'SUBMITTED',
        // Hidden after a report (item 2.7): it cannot be accepted, so it waits on nobody.
        hiddenAt: null,
        // On a request still taking decisions: one closed without accepting
        // left its suggestions readable, not waiting (FR-5.10).
        request: { state: { in: ['OPEN', 'ANSWERED'] }, storyboard: mine },
      },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: NEEDS_YOU.suggestions,
      select: {
        id: true,
        publicId: true,
        wordCount: true,
        submittedAt: true,
        contributor: { select: { id: true, username: true, displayName: true, status: true } },
        request: {
          select: {
            publicId: true,
            title: true,
            storyboard: { select: { slug: true, title: true, isSeed: true } },
            section: { select: { chapter: { select: { order: true, title: true } } } },
          },
        },
      },
    })

    const thinking = await ctx.db.contributionRequest.findMany({
      where: {
        kind: 'UNBLOCK',
        // Answered: an idea from outside the story arrived (FR-5.9) and the
        // request is not resolved, so none has been marked as having helped.
        state: 'ANSWERED',
        ideas: { none: { markedHelpful: true } },
        storyboard: mine,
      },
      orderBy: { createdAt: 'asc' },
      take: NEEDS_YOU.requests,
      select: {
        id: true,
        publicId: true,
        title: true,
        createdAt: true,
        storyboard: { select: { slug: true, title: true } },
        section: { select: { chapter: { select: { order: true, title: true } } } },
        _count: {
          select: { ideas: { where: { parentId: null, deletedAt: null, hiddenAt: null } } },
        },
      },
    })

    return {
      suggestions,
      requests: thinking.map(({ _count, ...request }) => ({ ...request, ideas: _count.ideas })),
    }
  }),

  /**
   * FR-5.10 — closing does not delete the suggestions; they stay readable,
   * marked as not accepted (`waitsOnClosedRequest`). Everyone with a draft or
   * a suggestion waiting is told, as they are when a story goes private.
   */
  /** Item 5.5 — who would be told if this request closed now, for the dialog. */
  closeImpact: protectedProcedure
    .input(z.object({ requestId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { request } = await requireAuthorOfRequest(ctx, input.requestId)
      return requestImpact(ctx.db, { id: request.id })
    }),

  // Item 5.5 — the `reason` this used to take was written nowhere and read
  // by nothing; it is gone.
  close: activeProcedure
    .input(z.object({ requestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { request } = await requireAuthorOfRequest(ctx, input.requestId)

      // Only an open one: a resolved request has had its answer.
      if (await closeRequest(ctx.db, request.id, ctx.session.user.id)) {
        log.info({ event: 'request.close', requestId: request.id }, 'request closed')
      }
      return ctx.db.contributionRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: { id: true, state: true },
      })
    }),

  /**
   * Phase 14, item 6.1 (architecture §6) — the authors change a request while
   * it is open or answered and the story is not finished: the title, the ask,
   * the story so far, tone and character notes, the rules, the reading and
   * the word bounds. Never the kind, never the section. Nobody is told; new
   * bounds apply to what is sent from now on. Until this, the only way to fix
   * a typo was to close the request, which emailed everyone with a draft.
   */
  update: activeProcedure.input(updateRequestSchema).mutation(async ({ ctx, input }) => {
    const { request, storyboard } = await requireAuthorOfRequest(ctx, input.requestId)
    assertNotFinished(storyboard.resource)
    if (request.state !== 'OPEN' && request.state !== 'ANSWERED') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A request can be changed while it is open. Open it again first.',
      })
    }
    const { kind } = await ctx.db.contributionRequest.findUniqueOrThrow({
      where: { id: request.id },
      select: { kind: true },
    })
    const prose = PROSE_KINDS.includes(kind)
    if (prose && countWords(input.preContext ?? '') < REQUEST_PRE_CONTEXT_WORDS.min) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: PRE_CONTEXT_TOO_SHORT })
    }

    // Still open or answered at the moment of writing: closed by the nightly
    // job, or by another tab, it was changed while closed (2026-10-24 final pass).
    const editedAt = new Date()
    const { count } = await ctx.db.contributionRequest.updateMany({
      where: { id: request.id, state: { in: ['OPEN', 'ANSWERED'] } },
      data: {
        title: input.title,
        ask: input.ask,
        preContext: prose ? (input.preContext ?? null) : null,
        toneNotes: input.toneNotes ?? null,
        characterNotes: input.characterNotes ?? null,
        constraints: input.constraints ?? [],
        readingList: input.readingList ?? [],
        minWords: input.minWords,
        maxWords: input.maxWords,
        editedAt,
      },
    })
    if (count !== 1) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This request closed a moment ago, so it was not changed. Open it again first.',
      })
    }
    const updated = await ctx.db.contributionRequest.findUniqueOrThrow({
      where: { id: request.id },
      select: { id: true, publicId: true, editedAt: true },
    })
    log.info({ event: 'request.update', requestId: request.id }, 'request changed')
    return updated
  }),

  /** FR-5.9 — reopening notifies everyone who has ever submitted to it. */
  reopen: activeProcedure
    .input(z.object({ requestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { request, storyboard } = await requireAuthorOfRequest(ctx, input.requestId)
      assertNotFinished(storyboard.resource)
      const section = await ctx.db.section.findUniqueOrThrow({
        where: { id: request.sectionId },
        select: {
          deletedAt: true,
          mergedIntoId: true,
          chapter: { select: { versionId: true, deletedAt: true } },
        },
      })
      await assertInMainDraft(ctx.db, section.chapter.versionId)
      // Found by item 5.2's flow: a request closed because its section was
      // removed or joined away could be opened again, on text that was no
      // longer in the story. Bring the section back first (item 5.7).
      if (section.deletedAt || section.mergedIntoId || section.chapter.deletedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That section is no longer in the story, so this cannot be opened again.',
        })
      }

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

      // What is waiting on the author: suggestions for a prose request, ideas
      // from outside the story for a "help me think" one (item 1.12).
      const { kind } = await ctx.db.contributionRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: { kind: true },
      })
      const submitted =
        kind === 'UNBLOCK'
          ? await ctx.db.idea.count({
              where: { requestId: request.id, ...ideaAnswerWhere(storyboard.resource) },
            })
          : await ctx.db.suggestion.count({
              where: { requestId: request.id, state: 'SUBMITTED' },
            })

      // Only from closed or resolved, and so only once: a second click, or a
      // second tab, finds it open and tells nobody a second time.
      const reopened = await unlessAlreadyOpen(
        'This section already has another request open.',
        () =>
          ctx.db.contributionRequest.updateMany({
            where: { id: request.id, state: { in: ['CLOSED', 'RESOLVED'] } },
            data: {
              state: submitted > 0 ? 'ANSWERED' : 'OPEN',
              closedAt: null,
              resolvedAt: null,
              // Item 6.15 (D-8) — opened again: a fresh thirty days.
              openedAt: new Date(),
            },
          }),
      )

      if (reopened.count === 1) {
        // FR-5.9 — everyone who ever sent something here, and nobody who only
        // opened a draft. It sent the stale notice, "the section you helped
        // with changed", to everyone with a row until the 2026-10-16 review.
        const deciderId = ctx.session.user.id
        await afterCommit('request.reopen.notify', async () => {
          const senders = await ctx.db.suggestion.findMany({
            where: {
              requestId: request.id,
              submittedAt: { not: null },
              contributorId: { not: deciderId },
            },
            distinct: ['contributorId'],
            select: { contributorId: true },
          })
          await ctx.db.notification.createMany({
            data: senders.map((entry) => ({
              userId: entry.contributorId,
              type: 'REQUEST_REOPENED' as const,
              // Item 6.9 — who reopened it, for the row to name.
              payload: { requestId: request.id, byId: deciderId },
            })),
          })
        })
        log.info({ event: 'request.reopen', requestId: request.id }, 'request reopened')
      }

      return ctx.db.contributionRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: { id: true, state: true },
      })
    }),
})

function asStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

/**
 * FR-5.1 with FR-10.1 — help is asked for on the main draft, the one readers
 * read. A request on an alternate version's section was allowed until the
 * 2026-10-16 spec review: helpers answered prose no reader can see, and
 * accepting wrote into the alternate under "Accept into the main draft".
 */
async function assertInMainDraft(db: PrismaClient, versionId: string): Promise<void> {
  const version = await db.version.findUniqueOrThrow({
    where: { id: versionId },
    select: { isMain: true },
  })
  if (!version.isMain) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Help is asked for on the main draft. An alternate version is for trying things, and only its authors see it.',
    })
  }
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

/**
 * `one_open_request_per_section` is the real guard; the checks above only make
 * it a sentence. Two requests opened at once both pass the check, and the one
 * the index refuses used to get a server fault for an answer (phase 12 audit).
 * Now it gets the same sentence the check would have given.
 */
async function unlessAlreadyOpen<T>(message: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new TRPCError({ code: 'CONFLICT', message })
    }
    throw error
  }
}
