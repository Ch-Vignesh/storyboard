import type { Prisma } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadStoryboard, loadVersion } from '@/lib/authz/guard'
import { logger } from '@/lib/logger'
import { closeRequest, closeRequestsOnSections } from '@/server/close-requests'

import { copyTree } from '@/server/tree'

import { activeProcedure, actorFrom, createTRPCRouter, publicProcedure } from '../init'

const log = logger.child({ router: 'version' })

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Give the version a name.')
  .max(120, 'That name is too long.')

/**
 * Alternate versions (FR-10.1, FR-10.2).
 *
 * Creating one copies the chapter and section tree; revisions are **not**
 * copied, because they are immutable and shared (architecture section 2.2).
 * `lineageId` is carried across, and that is what lets a section in one version
 * be matched to its counterpart in another — for comparison (FR-7.5) and for
 * credits (FR-9.5).
 */
export const versionRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId, permissions } = await loadStoryboard(ctx.db, actor, {
        id: input.storyboardId,
      })

      const versions = await ctx.db.version.findMany({
        where: { storyboardId },
        orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          isMain: true,
          createdAt: true,
          baseVersionId: true,
          createdBy: { select: { id: true, username: true, displayName: true } },
          chapters: {
            where: { deletedAt: null },
            select: {
              id: true,
              sections: {
                where: { deletedAt: null, mergedIntoId: null },
                select: { wordCount: true },
              },
            },
          },
        },
      })

      return {
        permissions,
        versions: versions.map((version) => ({
          id: version.id,
          name: version.name,
          isMain: version.isMain,
          createdAt: version.createdAt,
          baseVersionId: version.baseVersionId,
          createdBy: version.createdBy,
          chapters: version.chapters.length,
          wordCount: version.chapters.reduce(
            (total, chapter) =>
              total + chapter.sections.reduce((sum, section) => sum + section.wordCount, 0),
            0,
          ),
        })),
      }
    }),

  /**
   * FR-10.1 — copies the tree at the current head. Storage is a rounding error
   * next to the simplicity it buys (architecture section 2.1): a 120,000-word
   * novel is about 700 KB of JSON, and none of that JSON is copied here anyway.
   */
  create: activeProcedure
    .input(z.object({ baseVersionId: z.string().min(1), name: nameSchema }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { versionId, storyboardId } = await loadVersion(
        ctx.db,
        actor,
        input.baseVersionId,
        'version:create',
      )

      const created = await ctx.db.$transaction(async (tx) => {
        const version = await tx.version.create({
          data: {
            storyboardId,
            name: input.name,
            isMain: false,
            baseVersionId: versionId,
            createdById: ctx.session.user.id,
          },
          select: { id: true },
        })

        await copyTree(tx, versionId, version.id)
        return version
      })

      log.info(
        { event: 'version.create', versionId: created.id, storyboardId, from: versionId },
        'alternate version created',
      )
      return created
    }),

  rename: activeProcedure
    .input(z.object({ versionId: z.string().min(1), name: nameSchema }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { versionId } = await loadVersion(ctx.db, actor, input.versionId, 'version:create')
      return ctx.db.version.update({
        where: { id: versionId },
        data: { name: input.name },
        select: { id: true, name: true },
      })
    }),

  /**
   * FR-10.2 — promotion swaps `isMain` and retains the previous main as an
   * alternate. Nothing is discarded and no prose moves: it is two rows.
   *
   * The partial unique index `one_main_per_storyboard` means the two updates
   * cannot both hold `isMain = true` even for an instant, so the old main is
   * demoted first, inside the same transaction.
   */
  promoteToMain: activeProcedure
    .input(z.object({ versionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { versionId, storyboardId, isMain } = await loadVersion(
        ctx.db,
        actor,
        input.versionId,
        'version:create',
      )

      if (isMain) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That is already the main draft.',
        })
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const previous = await tx.version.findFirst({
          where: { storyboardId, isMain: true },
          select: { id: true, name: true },
        })

        // Demote first: the index permits exactly one main at a time.
        if (previous) {
          await tx.version.update({ where: { id: previous.id }, data: { isMain: false } })
        }
        await tx.version.update({ where: { id: versionId }, data: { isMain: true } })

        const stranded = previous ? await carryRequestsOver(tx, previous.id, versionId) : []
        return {
          previousId: previous?.id ?? null,
          previousName: previous?.name ?? null,
          stranded,
        }
      })

      // Those with nowhere to go are closed, and their helpers told, as for
      // any other close. After the transaction: telling is not part of it.
      for (const requestId of result.stranded) await closeRequest(ctx.db, requestId)

      // NFR-7 — promotion is one of the socially consequential moments.
      log.info(
        {
          event: 'version.promoted',
          versionId,
          storyboardId,
          previousMainId: result.previousId,
          requestsClosed: result.stranded.length,
          userId: ctx.session.user.id,
        },
        'version promoted to main draft',
      )
      return { versionId, previousId: result.previousId, previousName: result.previousName }
    }),

  /**
   * An alternate version can be removed. The main draft cannot: FR-10.2 says
   * the previous main is retained, and a storyboard with no main has no
   * reading order at all.
   *
   * A tombstone, like every other structural delete (decision 0008).
   */
  delete: activeProcedure
    .input(z.object({ versionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { versionId, isMain } = await loadVersion(
        ctx.db,
        actor,
        input.versionId,
        'version:create',
      )

      if (isMain) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The main draft cannot be removed. Promote another version first.',
        })
      }

      const removed = await ctx.db.$transaction(async (tx) => {
        const now = new Date()
        const chapters = await tx.chapter.findMany({
          where: { versionId, deletedAt: null },
          select: { id: true },
        })
        const sections = await tx.section.findMany({
          where: { chapterId: { in: chapters.map((chapter) => chapter.id) }, deletedAt: null },
          select: { id: true },
        })
        await tx.section.updateMany({
          where: { id: { in: sections.map((section) => section.id) } },
          data: { deletedAt: now },
        })
        await tx.chapter.updateMany({
          where: { versionId, deletedAt: null },
          data: { deletedAt: now },
        })
        return sections.map((section) => section.id)
      })
      // A request can no longer be opened on an alternate, but one opened
      // before that rule, or carried here by a promotion, would be left open
      // on text that is gone.
      await closeRequestsOnSections(ctx.db, removed)

      log.info({ event: 'version.delete', versionId }, 'alternate version removed')
      return { ok: true }
    }),
})

export { copyTree } from '@/server/tree'

/**
 * FR-10.2 with FR-5.1 — the open requests on the draft that was main, moved
 * to the same section (by lineage) in the draft that is main now. Until the
 * 2026-10-16 spec review they stayed on the demoted draft: helpers went on
 * answering prose readers could no longer see, and an accept wrote into the
 * alternate.
 *
 * Their suggestions come along untouched. Each still names the revision it
 * was written against, so if the new main's text differs, FR-6.7 already says
 * what happens: the author sees it was written against an earlier text.
 *
 * Returns the requests with nowhere to go, because the new main has no such
 * section or already has a request open on it, for the caller to close.
 */
async function carryRequestsOver(
  tx: Prisma.TransactionClient,
  fromVersionId: string,
  toVersionId: string,
): Promise<string[]> {
  const open = await tx.contributionRequest.findMany({
    where: {
      state: { in: ['OPEN', 'ANSWERED'] },
      section: { chapter: { versionId: fromVersionId } },
    },
    select: { id: true, section: { select: { lineageId: true } } },
  })
  if (open.length === 0) return []

  const counterparts = await tx.section.findMany({
    where: {
      lineageId: { in: open.map((request) => request.section.lineageId) },
      deletedAt: null,
      mergedIntoId: null,
      chapter: { versionId: toVersionId, deletedAt: null },
    },
    select: {
      id: true,
      lineageId: true,
      requests: { where: { state: { in: ['OPEN', 'ANSWERED'] } }, select: { id: true } },
    },
  })
  const counterpartOf = new Map(counterparts.map((section) => [section.lineageId, section]))

  const stranded: string[] = []
  for (const request of open) {
    const counterpart = counterpartOf.get(request.section.lineageId)
    if (!counterpart || counterpart.requests.length > 0) {
      stranded.push(request.id)
      continue
    }
    await tx.contributionRequest.update({
      where: { id: request.id },
      data: { sectionId: counterpart.id },
    })
  }
  return stranded
}
