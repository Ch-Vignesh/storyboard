import { randomUUID } from 'node:crypto'

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadChapter, loadVersion } from '@/lib/authz/guard'
import { emptyDoc, flavourForStoryType } from '@/lib/doc/schema'
import { derive } from '@/lib/doc/text'
import { TITLE_MAX_CHARS } from '@/lib/schemas/constants'
import { afterCommit } from '@/server/after-commit'
import { closeRequestsOnSections } from '@/server/close-requests'
import { sectionsRequestImpact } from '@/server/impact'
import { logger } from '@/lib/logger'
import { SOFT_DELETE_GRACE_DAYS } from '@/lib/schemas/constants'

import { activeProcedure, actorFrom, createTRPCRouter, protectedProcedure } from '../init'

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Give the chapter a name.')
  .max(TITLE_MAX_CHARS, 'That name is too long.')

const log = logger.child({ router: 'chapter' })

export const chapterRouter = createTRPCRouter({
  /** FR-2.3 — a new chapter goes to the end and arrives with one empty section. */
  create: activeProcedure
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

  rename: activeProcedure
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
  reorder: activeProcedure
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
          message: 'That ordering does not match this story.',
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
  /**
   * Phase 14, item 5.2 — what removing this chapter would do, for the dialog
   * that asks first: its sections and their words, the requests on them that
   * would close, and the people who would be told. Read with the right the
   * removal itself needs, so nobody learns the shape of a chapter they may
   * not change.
   */
  removalImpact: protectedProcedure
    .input(z.object({ chapterId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { chapterId } = await loadChapter(
        ctx.db,
        actor,
        input.chapterId,
        'storyboard:structure',
      )
      const sections = await ctx.db.section.findMany({
        where: { chapterId, deletedAt: null, mergedIntoId: null },
        select: { id: true, wordCount: true },
      })
      const requests = await sectionsRequestImpact(
        ctx.db,
        sections.map((section) => section.id),
      )
      return {
        sections: sections.length,
        words: sections.reduce((total, section) => total + section.wordCount, 0),
        ...requests,
      }
    }),

  /**
   * Phase 14, item 5.7 (decision 0008) — what was removed from this version
   * in the last `SOFT_DELETE_GRACE_DAYS`, and can be brought back: chapters,
   * and sections whose chapter is still in the story (a section in a removed
   * chapter comes back with the chapter). Nothing from a deleted version.
   */
  removed: protectedProcedure
    .input(z.object({ versionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { versionId } = await loadVersion(
        ctx.db,
        actor,
        input.versionId,
        'storyboard:structure',
      )
      const since = new Date(Date.now() - SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000)
      const [chapters, sections] = await Promise.all([
        ctx.db.chapter.findMany({
          where: { versionId, deletedAt: { gte: since } },
          orderBy: { deletedAt: 'desc' },
          select: {
            id: true,
            title: true,
            deletedAt: true,
            sections: {
              where: { mergedIntoId: null },
              select: { wordCount: true, deletedAt: true },
            },
          },
        }),
        ctx.db.section.findMany({
          where: {
            chapter: { versionId, deletedAt: null },
            deletedAt: { gte: since },
            mergedIntoId: null,
          },
          orderBy: { deletedAt: 'desc' },
          select: {
            id: true,
            title: true,
            wordCount: true,
            deletedAt: true,
            chapter: { select: { title: true } },
          },
        }),
      ])
      return {
        chapters: chapters.map((chapter) => {
          // What comes back with it: the sections removed with it, by its
          // removal time, as `restore` brings them. One removed earlier stays
          // removed, and was counted here (2026-10-26 final pass).
          const returning = chapter.sections.filter(
            (section) => section.deletedAt?.getTime() === chapter.deletedAt?.getTime(),
          )
          return {
            id: chapter.id,
            title: chapter.title,
            removedAt: chapter.deletedAt,
            sections: returning.length,
            words: returning.reduce((total, section) => total + section.wordCount, 0),
          }
        }),
        sections: sections.map((section) => ({
          id: section.id,
          title: section.title,
          chapterTitle: section.chapter.title,
          removedAt: section.deletedAt,
          words: section.wordCount,
        })),
      }
    }),

  /**
   * Item 5.7 — a removed chapter comes back, with the sections that went with
   * it, at the end of its version. Its lineage is unchanged, so its history
   * and credits are where they were. Requests closed by the removal stay
   * closed. Not from a deleted version (item 1.1), and not after the grace.
   */
  restore: activeProcedure
    .input(z.object({ chapterId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { chapterId, versionId } = await loadChapter(
        ctx.db,
        actor,
        input.chapterId,
        'storyboard:structure',
      )
      const chapter = await ctx.db.chapter.findUniqueOrThrow({
        where: { id: chapterId },
        select: { deletedAt: true, version: { select: { deletedAt: true } } },
      })
      if (!chapter.deletedAt) return { ok: true, restored: false }
      if (chapter.version.deletedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That version was deleted.' })
      }
      if (chapter.deletedAt.getTime() < Date.now() - SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A removed chapter can be brought back for ${String(SOFT_DELETE_GRACE_DAYS)} days.`,
        })
      }

      await ctx.db.$transaction(async (tx) => {
        const last = await tx.chapter.findFirst({
          where: { versionId, deletedAt: null },
          orderBy: { order: 'desc' },
          select: { order: true },
        })
        await tx.chapter.update({
          where: { id: chapterId },
          data: { deletedAt: null, order: (last?.order ?? -1) + 1 },
        })
        // The sections that went with it: removed at the same instant.
        await tx.section.updateMany({
          where: { chapterId, deletedAt: chapter.deletedAt ?? undefined },
          data: { deletedAt: null },
        })
      })
      log.info({ event: 'chapter.restore', chapterId }, 'removed chapter brought back')
      return { ok: true, restored: true }
    }),

  delete: activeProcedure
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
          message: 'A story keeps at least one chapter. Rename this one instead.',
        })
      }

      await ctx.db.$transaction(async (tx) => {
        const now = new Date()
        // One structural change to a version at a time: two removals at once
        // each counted the other's chapter as still there, and the version
        // was left with none (2026-10-26 final pass, the detective review).
        await tx.$executeRaw`select 1 from "Version" where id = ${versionId} for update`
        // Only a live chapter. Removed again from a stale tab, it took a new
        // removal time, and bringing it back left its sections behind, since
        // they come back by the chapter's time (2026-10-26 final pass).
        const marked = await tx.chapter.updateMany({
          where: { id: chapterId, deletedAt: null },
          data: { deletedAt: now },
        })
        if (marked.count !== 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That chapter was removed already.' })
        }
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
        if (remaining.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'A story keeps at least one chapter. Rename this one instead.',
          })
        }
        for (const [order, chapter] of remaining.entries()) {
          await tx.chapter.update({ where: { id: chapter.id }, data: { order } })
        }
      })

      // Requests on the chapter's sections have nothing left to be about.
      await afterCommit('chapter.delete.close_requests', async () => {
        const sections = await ctx.db.section.findMany({
          where: { chapterId },
          select: { id: true },
        })
        await closeRequestsOnSections(
          ctx.db,
          sections.map((section) => section.id),
        )
      })

      return { ok: true }
    }),
})
