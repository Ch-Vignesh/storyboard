import { randomUUID } from 'node:crypto'

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { emptyDoc, flavourForStoryType } from '@/lib/doc/schema'
import { derive } from '@/lib/doc/text'
import { publicId, slugify } from '@/lib/ids'
import { loadStoryboard, visibleStoryboardsWhere } from '@/lib/authz/guard'
import { DAILY_LIMITS } from '@/lib/schemas/constants'
import {
  createStoryboardSchema,
  updateStoryboardSchema,
  visibilitySchema,
} from '@/lib/schemas/storyboard'
import { logger } from '@/lib/logger'

import { actorFrom, createTRPCRouter, protectedProcedure, publicProcedure } from '../init'

const log = logger.child({ router: 'storyboard' })

export const storyboardRouter = createTRPCRouter({
  /**
   * FR-2.1 and FR-2.2. A new storyboard is never a blank slate: it arrives with
   * the main draft, one chapter and one empty section, all in a single
   * transaction so a failure cannot leave a storyboard with no tree.
   */
  create: protectedProcedure.input(createStoryboardSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id

    // FR-13.3 — five a day. Counted here rather than in Redis because phase 1
    // has no Redis and a row count is exact; phase 6 moves it.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const createdToday = await ctx.db.storyboard.count({
      where: { ownerId: userId, createdAt: { gte: since } },
    })
    if (createdToday >= DAILY_LIMITS.storyboardsCreated) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `You can start ${DAILY_LIMITS.storyboardsCreated} storyboards a day. Try again tomorrow.`,
      })
    }

    const genres = await ctx.db.genre.findMany({
      where: { id: { in: input.genreIds } },
      select: { id: true },
    })
    if (genres.length !== input.genreIds.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown genre.' })
    }

    const id = publicId()
    const slug = `${slugify(input.title)}-${id}`
    const flavour = flavourForStoryType(input.type)
    const doc = emptyDoc(flavour)
    const derived = derive(doc)

    const storyboard = await ctx.db.$transaction(async (tx) => {
      const created = await tx.storyboard.create({
        data: {
          publicId: id,
          slug,
          title: input.title,
          type: input.type,
          visibility: input.visibility,
          ownerId: userId,
          // Decision 0007: stamped the moment it is first public, never cleared.
          publicFrom: input.visibility === 'PUBLIC' ? new Date() : null,
          genres: { create: input.genreIds.map((genreId) => ({ genreId })) },
        },
        select: { id: true, slug: true, publicId: true, title: true },
      })

      // FR-2.2 — one main version, one chapter, one empty section.
      const version = await tx.version.create({
        data: {
          storyboardId: created.id,
          name: 'Main draft',
          isMain: true,
          createdById: userId,
        },
        select: { id: true },
      })

      const chapter = await tx.chapter.create({
        data: {
          versionId: version.id,
          lineageId: randomUUID(),
          order: 0,
          title: 'Chapter one',
        },
        select: { id: true },
      })

      const section = await tx.section.create({
        data: {
          chapterId: chapter.id,
          lineageId: randomUUID(),
          order: 0,
          wordCount: 0,
        },
        select: { id: true },
      })

      // The section's first revision, so history starts at the beginning and
      // the editor always has a head to write against.
      const revision = await tx.revision.create({
        data: {
          sectionId: section.id,
          contentJson: doc,
          contentText: derived.contentText,
          wordCount: derived.wordCount,
          contentHash: derived.contentHash,
          source: 'AUTHORED',
          authorId: userId,
        },
        select: { id: true },
      })

      await tx.section.update({
        where: { id: section.id },
        data: { currentRevisionId: revision.id },
      })

      return created
    })

    log.info(
      { event: 'storyboard.create', storyboardId: storyboard.id, userId },
      'storyboard created',
    )
    return storyboard
  }),

  /**
   * The reader's entry point. Returns the storyboard, its chapter list and the
   * permissions the client is allowed to act on — never a raw row, so a
   * component has nothing to decide (architecture section 7).
   *
   * Chapters carry counts only; a chapter's prose is fetched separately so a
   * 120,000-word manuscript never ships in one payload (NFR-1).
   */
  get: publicProcedure
    .input(z.object({ slug: z.string().min(1), versionId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      const { storyboardId, resource, permissions } = await loadStoryboard(ctx.db, actor, {
        slug: input.slug,
      })

      const storyboard = await ctx.db.storyboard.findUniqueOrThrow({
        where: { id: storyboardId },
        select: {
          id: true,
          publicId: true,
          slug: true,
          title: true,
          logline: true,
          type: true,
          visibility: true,
          state: true,
          rightsNote: true,
          isSeed: true,
          publicFrom: true,
          finishedAt: true,
          createdAt: true,
          owner: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          genres: { select: { genre: { select: { id: true, slug: true, name: true } } } },
          collaborators: {
            where: { acceptedAt: { not: null } },
            select: { user: { select: { id: true, username: true, displayName: true } } },
          },
        },
      })

      // The requested version must belong to this storyboard; otherwise a valid
      // id from someone else's storyboard would read through.
      const version = await ctx.db.version.findFirst({
        where: input.versionId
          ? { id: input.versionId, storyboardId }
          : { storyboardId, isMain: true },
        select: { id: true, name: true, isMain: true },
      })
      if (!version) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That version does not exist.' })
      }

      const chapters = await ctx.db.chapter.findMany({
        where: { versionId: version.id, deletedAt: null },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          lineageId: true,
          order: true,
          title: true,
          sections: {
            where: { mergedIntoId: null, deletedAt: null },
            orderBy: { order: 'asc' },
            select: { id: true, lineageId: true, order: true, title: true, wordCount: true },
          },
        },
      })

      return {
        storyboard: {
          ...storyboard,
          genres: storyboard.genres.map((entry) => entry.genre),
          coauthors: storyboard.collaborators.map((entry) => entry.user),
          collaborators: undefined,
          wordCount: chapters.reduce(
            (total, chapter) =>
              total + chapter.sections.reduce((sum, section) => sum + section.wordCount, 0),
            0,
          ),
        },
        version,
        chapters,
        permissions,
        /** Decision 0007: the reader may not see the whole chain. */
        historyVisibleFrom:
          permissions.role === 'owner' || permissions.role === 'coauthor'
            ? null
            : resource.publicFrom,
      }
    }),

  /** FR-11.1 region one: storyboards you are writing, owned or co-authored. */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const rows = await ctx.db.storyboard.findMany({
      where: {
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId, acceptedAt: { not: null } } } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        type: true,
        visibility: true,
        state: true,
        isSeed: true,
        ownerId: true,
        updatedAt: true,
        genres: { select: { genre: { select: { id: true, name: true } } } },
        versions: {
          where: { isMain: true },
          select: {
            chapters: {
              where: { deletedAt: null },
              select: {
                sections: {
                  where: { mergedIntoId: null, deletedAt: null },
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
      type: row.type,
      visibility: row.visibility,
      state: row.state,
      isSeed: row.isSeed,
      updatedAt: row.updatedAt,
      role: row.ownerId === userId ? ('owner' as const) : ('coauthor' as const),
      genres: row.genres.map((entry) => entry.genre),
      wordCount:
        row.versions[0]?.chapters.reduce(
          (total, chapter) =>
            total + chapter.sections.reduce((sum, section) => sum + section.wordCount, 0),
          0,
        ) ?? 0,
    }))
  }),

  /** Title, logline, genres and the rights note (FR-2.1, FR-14.5). */
  update: protectedProcedure.input(updateStoryboardSchema).mutation(async ({ ctx, input }) => {
    const actor = actorFrom(ctx.session)
    const { storyboardId } = await loadStoryboard(
      ctx.db,
      actor,
      { id: input.storyboardId },
      'storyboard:edit',
    )

    if (input.genreIds) {
      const genres = await ctx.db.genre.findMany({
        where: { id: { in: input.genreIds } },
        select: { id: true },
      })
      if (genres.length !== input.genreIds.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown genre.' })
      }
    }

    return ctx.db.$transaction(async (tx) => {
      if (input.genreIds) {
        await tx.storyboardGenre.deleteMany({ where: { storyboardId } })
        await tx.storyboardGenre.createMany({
          data: input.genreIds.map((genreId) => ({ storyboardId, genreId })),
        })
      }
      return tx.storyboard.update({
        where: { id: storyboardId },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.logline === undefined ? {} : { logline: input.logline }),
          ...(input.rightsNote === undefined ? {} : { rightsNote: input.rightsNote }),
        },
        select: { id: true, title: true, logline: true, rightsNote: true },
      })
    })
  }),

  /**
   * FR-2.7, owner only. Going public stamps `publicFrom` once and never clears
   * it (decision 0007) — once a revision has been publicly readable, pretending
   * it can be unseen is exactly the false protection FR-13.6 forbids.
   *
   * Closing open requests on the way to private is phase 2's job; there are no
   * requests yet, and the hook is marked below rather than half-built.
   */
  setVisibility: protectedProcedure
    .input(z.object({ storyboardId: z.string().min(1), visibility: visibilitySchema }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      const { storyboardId, resource } = await loadStoryboard(
        ctx.db,
        actor,
        { id: input.storyboardId },
        'storyboard:setVisibility',
      )

      const goingPublic = input.visibility === 'PUBLIC'
      const updated = await ctx.db.storyboard.update({
        where: { id: storyboardId },
        data: {
          visibility: input.visibility,
          ...(goingPublic && resource.publicFrom === null ? { publicFrom: new Date() } : {}),
        },
        select: { id: true, visibility: true, publicFrom: true },
      })

      // TODO(phase 2, FR-2.7): going private closes every open request and
      // notifies anyone with a suggestion in flight. Neither exists yet.
      log.info(
        { event: 'storyboard.setVisibility', storyboardId, visibility: input.visibility },
        'visibility changed',
      )
      return updated
    }),

  /**
   * FR-2.6 — soft delete with a 30-day grace. The contributors whose work is
   * affected are named by `deletionImpact` so the confirmation can list them;
   * this procedure only records the decision.
   */
  delete: protectedProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      const { storyboardId } = await loadStoryboard(
        ctx.db,
        actor,
        { id: input.storyboardId },
        'storyboard:delete',
      )

      const updated = await ctx.db.storyboard.update({
        where: { id: storyboardId },
        data: { deletedAt: new Date(), state: 'DELETED' },
        select: { id: true, deletedAt: true },
      })

      log.info({ event: 'storyboard.delete', storyboardId }, 'storyboard soft-deleted')
      return updated
    }),

  /** Undo a soft delete inside the grace period. */
  restore: protectedProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      // The guard refuses writes to a deleted storyboard by design, so this one
      // procedure checks ownership directly. It is the only way back.
      const row = await ctx.db.storyboard.findUnique({
        where: { id: input.storyboardId },
        select: { id: true, ownerId: true, deletedAt: true },
      })
      if (row?.ownerId !== userId || row.deletedAt === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That storyboard does not exist.' })
      }

      return ctx.db.storyboard.update({
        where: { id: row.id },
        data: { deletedAt: null, state: 'ACTIVE' },
        select: { id: true, slug: true },
      })
    }),

  /**
   * FR-2.6 — who is affected by deleting this. The confirmation names them,
   * because "3 contributors" is a number and "Leah, Arjun and Maya" is a
   * decision.
   */
  deletionImpact: protectedProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      const { storyboardId } = await loadStoryboard(
        ctx.db,
        actor,
        { id: input.storyboardId },
        'storyboard:delete',
      )

      const credits = await ctx.db.credit.findMany({
        where: { storyboardId },
        select: {
          contributor: { select: { id: true, username: true, displayName: true } },
        },
        distinct: ['contributorId'],
      })

      return { contributors: credits.map((credit) => credit.contributor) }
    }),

  /** Titles and authors only — FR-11.6 defers anything more than this. */
  browse: publicProcedure
    .input(z.object({ take: z.number().int().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
      return ctx.db.storyboard.findMany({
        where: visibleStoryboardsWhere(actor),
        orderBy: { createdAt: 'desc' },
        take: input?.take ?? 20,
        select: {
          id: true,
          slug: true,
          title: true,
          logline: true,
          type: true,
          isSeed: true,
          owner: { select: { username: true, displayName: true } },
          genres: { select: { genre: { select: { id: true, name: true } } } },
        },
      })
    }),
})
