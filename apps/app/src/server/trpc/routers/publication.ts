import { Prisma } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadStoryboard } from '@/lib/authz/guard'
import { logger } from '@/lib/logger'
import { BULK_WRITE_TRANSACTION, PUBLICATION_NOTE_MAX_CHARS } from '@/lib/schemas/constants'
import { afterCommit } from '@/server/after-commit'
import { recordEvent } from '@/server/audit'
import { notifyAuthors } from '@/server/notify-authors'
import { copyTree } from '@/server/tree'

import { activeProcedure, actorFrom, createTRPCRouter, publicProcedure } from '../init'

const log = logger.child({ router: 'publication' })

/**
 * Publishing (decision 0044, phase 14 milestone 7b). An edition is a frozen
 * copy of the main draft: a new `Version` with `frozenAt` set, sharing the
 * draft's revisions as every version does (decision 0014), so it costs rows,
 * not prose. Every write path refuses a frozen version in `lib/authz/guard.ts`,
 * so an edition never changes; it can only be succeeded by the next one.
 */
export const publicationRouter = createTRPCRouter({
  /** Item 7b.1 — the main draft, as it stands, becomes the next edition. */
  publish: activeProcedure
    .input(
      z.object({
        storyboardId: z.string().min(1),
        note: z
          .string()
          .trim()
          .max(
            PUBLICATION_NOTE_MAX_CHARS,
            `Keep the note under ${String(PUBLICATION_NOTE_MAX_CHARS)} characters.`,
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId } = await loadStoryboard(
        ctx.db,
        actor,
        { id: input.storyboardId },
        'storyboard:publish',
      )
      const userId = ctx.session.user.id

      const main = await ctx.db.version.findFirst({
        where: { storyboardId, isMain: true },
        select: { id: true },
      })
      if (!main) throw new TRPCError({ code: 'NOT_FOUND', message: 'That story does not exist.' })
      const written = await ctx.db.section.aggregate({
        where: {
          chapter: { versionId: main.id, deletedAt: null },
          deletedAt: null,
          mergedIntoId: null,
        },
        _sum: { wordCount: true },
      })
      if (!written._sum.wordCount) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'There is nothing to publish yet. Write something in the main draft first.',
        })
      }

      let publication: { id: string; number: number; versionId: string }
      try {
        publication = await ctx.db.$transaction(async (tx) => {
          const last = await tx.publication.findFirst({
            where: { storyboardId },
            orderBy: { number: 'desc' },
            select: { number: true },
          })
          const number = (last?.number ?? 0) + 1
          const edition = await tx.version.create({
            data: {
              storyboardId,
              name: `Edition ${String(number)}`,
              isMain: false,
              baseVersionId: main.id,
              createdById: userId,
              frozenAt: new Date(),
            },
            select: { id: true },
          })
          await copyTree(tx, main.id, edition.id)
          return tx.publication.create({
            data: {
              storyboardId,
              number,
              versionId: edition.id,
              publishedById: userId,
              note: input.note?.length ? input.note : null,
            },
            select: { id: true, number: true, versionId: true },
          })
        }, BULK_WRITE_TRANSACTION)
      } catch (error) {
        // Two at once: the second reached for the number the first took, and
        // the unique index refused it. Nothing of it was kept.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Another edition was published a moment ago. Publish again for the next one.',
          })
        }
        throw error
      }

      // NFR-7 — a publication is one of the socially significant moments.
      log.info(
        { event: 'storyboard.published', storyboardId, number: publication.number, userId },
        'edition published',
      )
      await recordEvent(ctx.db, {
        event: 'storyboard.published',
        actorId: userId,
        subjectId: null,
        storyboardId,
        target: { type: 'VERSION', id: publication.versionId },
        detail: { number: publication.number },
      })
      // Item 7b.4 (FR-10.3, FR-10.6) — a published spin-off tells the story it
      // came from. Only a public one: a private edition is nobody's news, and
      // its link would lead nowhere. Not anyone who blocked its writer
      // (decision 0046), which `notifyAuthors` sees to.
      const story = await ctx.db.storyboard.findUniqueOrThrow({
        where: { id: storyboardId },
        select: { forkedFromId: true, visibility: true },
      })
      if (story.forkedFromId && story.visibility === 'PUBLIC') {
        const originalId = story.forkedFromId
        await afterCommit('publication.publish.notify', () =>
          notifyAuthors(
            ctx.db,
            originalId,
            'SPIN_OFF_PUBLISHED',
            { storyboardId, number: String(publication.number) },
            userId,
          ),
        )
      }
      return { number: publication.number }
    }),

  /**
   * Item 7b.2 — one edition by number, or the current one, for its reading
   * page. Read with the story's own read right, so a private story's
   * editions answer 404 as the story does; a number that was never published
   * answers 404 too.
   */
  get: publicProcedure
    .input(z.object({ slug: z.string().min(1), number: z.number().int().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId } = await loadStoryboard(ctx.db, actor, { slug: input.slug })
      const [edition, latest] = await Promise.all([
        ctx.db.publication.findFirst({
          where:
            input.number === undefined ? { storyboardId } : { storyboardId, number: input.number },
          orderBy: { number: 'desc' },
          select: {
            number: true,
            publishedAt: true,
            note: true,
            versionId: true,
            publishedBy: { select: { username: true, displayName: true, status: true } },
          },
        }),
        ctx.db.publication.findFirst({
          where: { storyboardId },
          orderBy: { number: 'desc' },
          select: { number: true },
        }),
      ])
      if (!edition) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That edition does not exist.' })
      }
      return { ...edition, current: edition.number === latest?.number }
    }),

  /**
   * Item 7b.1 — a story's editions, newest first, read with the story's own
   * read right: a private story's editions are as private as it is (FR-2.7).
   */
  list: publicProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId, permissions } = await loadStoryboard(ctx.db, actor, {
        id: input.storyboardId,
      })
      const editions = await ctx.db.publication.findMany({
        where: { storyboardId },
        orderBy: { number: 'desc' },
        select: {
          number: true,
          publishedAt: true,
          note: true,
          versionId: true,
          publishedBy: { select: { username: true, displayName: true, status: true } },
        },
      })
      return { editions, canPublish: permissions.canPublish }
    }),
})
