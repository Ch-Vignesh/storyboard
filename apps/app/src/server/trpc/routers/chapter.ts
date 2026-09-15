import { randomUUID } from 'node:crypto'

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadChapter, loadVersion } from '@/lib/authz/guard'
import { emptyDoc, flavourForStoryType } from '@/lib/doc/schema'
import { derive } from '@/lib/doc/text'

import { actorFrom, createTRPCRouter, protectedProcedure } from '../init'

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Give the chapter a name.')
  .max(200, 'That name is too long.')

export const chapterRouter = createTRPCRouter({
  /** FR-2.3 — a new chapter goes to the end and arrives with one empty section. */
  create: protectedProcedure
    .input(z.object({ versionId: z.string().min(1), title: titleSchema }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { versionId, storyboardId } = await loadVersion(
        ctx.db,
        actor,
        input.versionId,
        'storyboard:structure',
      )

      const storyboard = await ctx.db.storyboard.findUniqueOrThrow({
        where: { id: storyboardId },
        select: { type: true },
      })
      const doc = emptyDoc(flavourForStoryType(storyboard.type))
      const derived = derive(doc)
      const userId = ctx.session.user.id

      return ctx.db.$transaction(async (tx) => {
        const last = await tx.chapter.findFirst({
          where: { versionId, deletedAt: null },
          orderBy: { order: 'desc' },
          select: { order: true },
        })

        const chapter = await tx.chapter.create({
          data: {
            versionId,
            lineageId: randomUUID(),
            order: (last?.order ?? -1) + 1,
            title: input.title,
          },
          select: { id: true, order: true, title: true, lineageId: true },
        })

        const section = await tx.section.create({
          data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0 },
          select: { id: true },
        })
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

        return chapter
      })
    }),

  rename: protectedProcedure
    .input(z.object({ chapterId: z.string().min(1), title: titleSchema }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { chapterId } = await loadChapter(
        ctx.db,
        actor,
        input.chapterId,
        'storyboard:structure',
      )
      return ctx.db.chapter.update({
        where: { id: chapterId },
        data: { title: input.title },
        select: { id: true, title: true },
      })
    }),

  /**
   * FR-2.3 — reordering rewrites `order` for every sibling in one transaction,
   * so there is never a moment where two chapters share a position or a gap
   * appears in the sequence.
   */
  reorder: protectedProcedure
    .input(
      z.object({ versionId: z.string().min(1), chapterIds: z.array(z.string().min(1)).min(1) }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { versionId } = await loadVersion(
        ctx.db,
        actor,
        input.versionId,
        'storyboard:structure',
      )

      const existing = await ctx.db.chapter.findMany({
        where: { versionId, deletedAt: null },
        select: { id: true },
      })

      // The input must be a permutation of exactly this version's chapters.
      // Anything else — a missing id, a duplicate, a chapter from elsewhere —
      // would silently corrupt the reading order.
      const existingIds = new Set(existing.map((chapter) => chapter.id))
      const incoming = new Set(input.chapterIds)
      if (
        incoming.size !== input.chapterIds.length ||
        incoming.size !== existingIds.size ||
        input.chapterIds.some((id) => !existingIds.has(id))
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That ordering does not match this storyboard.',
        })
      }

      await ctx.db.$transaction(
        input.chapterIds.map((id, order) =>
          ctx.db.chapter.update({ where: { id }, data: { order } }),
        ),
      )
      return { ok: true }
    }),

  /**
   * A tombstone, not a delete (decision 0008). The chapter and its sections
   * leave the reading order; every revision underneath stays addressable,
   * because FR-8.2 allows exactly two hard deletes in this product and neither
   * of them is this one.
   *
   * The last chapter of a version cannot go: FR-2.2 promises a writer is never
   * shown a storyboard with no structure.
   */
  delete: protectedProcedure
    .input(z.object({ chapterId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { chapterId, versionId } = await loadChapter(
        ctx.db,
        actor,
        input.chapterId,
        'storyboard:structure',
      )

      const live = await ctx.db.chapter.count({ where: { versionId, deletedAt: null } })
      if (live <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A storyboard keeps at least one chapter. Rename this one instead.',
        })
      }

      await ctx.db.$transaction(async (tx) => {
        const now = new Date()
        await tx.chapter.update({ where: { id: chapterId }, data: { deletedAt: now } })
        await tx.section.updateMany({
          where: { chapterId, deletedAt: null },
          data: { deletedAt: now },
        })

        // Close the gap the tombstone leaves, so `order` stays 0..n-1.
        const remaining = await tx.chapter.findMany({
          where: { versionId, deletedAt: null },
          orderBy: { order: 'asc' },
          select: { id: true },
        })
        for (const [order, chapter] of remaining.entries()) {
          await tx.chapter.update({ where: { id: chapter.id }, data: { order } })
        }
      })

      return { ok: true }
    }),
})
