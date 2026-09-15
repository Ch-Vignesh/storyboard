import { compare, type ComparisonResult } from '@storyboard/compare'
import type { PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadSection, loadStoryboard, loadVersion } from '@/lib/authz/guard'
import { canReadRevisionAt } from '@/lib/authz'

import { actorFrom, createTRPCRouter, publicProcedure } from '../init'

/**
 * Comparison (FR-7). One component, two revision ids in, no variant code paths
 * (FR-7.5) — so this router is thin: it resolves ids to text, checks who may
 * read them, and hands both strings to the pure engine.
 *
 * Caching (NFR-2): keyed on `${baseRevisionId}:${targetRevisionId}`. Revisions
 * are immutable, so a cached result can never go stale and there is nothing to
 * invalidate. A suggestion draft has no stable id to key on, so it is computed
 * live and not cached — exactly as the architecture says.
 */

/** Both revisions must belong to the same section, or the comparison is nonsense. */
async function loadPair(
  db: PrismaClient,
  actor: { id: string } | null,
  baseId: string,
  targetId: string,
) {
  const revisions = await db.revision.findMany({
    where: { id: { in: [baseId, targetId] } },
    select: { id: true, sectionId: true, contentText: true, createdAt: true, wordCount: true },
  })
  const base = revisions.find((revision) => revision.id === baseId)
  const target = revisions.find((revision) => revision.id === targetId)
  if (!base || !target) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'That version does not exist.' })
  }
  if (base.sectionId !== target.sectionId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Those two versions belong to different sections.',
    })
  }

  // The section check is what enforces visibility; loadSection throws 404 for
  // anyone who may not read the storyboard.
  const section = await loadSection(db, actor, base.sectionId)

  // Decision 0007 — a reader of a formerly private storyboard must not reach a
  // pre-switch revision through the comparison view either.
  for (const revision of [base, target]) {
    if (!canReadRevisionAt(actor, section.resource, revision.createdAt)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'That version does not exist.' })
    }
  }

  return { base, target, section }
}

export const compareRouter = createTRPCRouter({
  /**
   * Two revisions. Serves FR-7.5's second and third cases — one revision
   * against another, and an alternate version against the main draft, since
   * both are just two revision ids.
   */
  revisions: publicProcedure
    .input(z.object({ baseId: z.string().min(1), targetId: z.string().min(1) }))
    .query(async ({ ctx, input }): Promise<ComparisonResult & { cached: boolean }> => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { base, target } = await loadPair(ctx.db, actor, input.baseId, input.targetId)

      const key = `${base.id}:${target.id}`
      const cached = await ctx.db.diffCache.findUnique({ where: { key } })
      if (cached) {
        return { ...(cached.result as unknown as ComparisonResult), cached: true }
      }

      const result = compare(base.contentText, target.contentText)

      // Best effort: a cache write that loses a race is not worth failing a read.
      await ctx.db.diffCache
        .create({
          data: {
            key,
            result,
            stats: result.stats,
          },
        })
        .catch(() => undefined)

      return { ...result, cached: false }
    }),

  /**
   * FR-7.5's third case: an alternate version against the main draft.
   *
   * Architecture section 2.3: outer-join the sections on `lineageId`, then diff
   * each pair's head revisions. A lineage present on one side only is a section
   * that was added or removed, not one that changed — which is why the join is
   * outer and why the result distinguishes them.
   */
  versions: publicProcedure
    .input(z.object({ baseVersionId: z.string().min(1), targetVersionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const base = await loadVersion(ctx.db, actor, input.baseVersionId)
      const target = await loadVersion(ctx.db, actor, input.targetVersionId)

      if (base.storyboardId !== target.storyboardId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Those versions belong to different storyboards.',
        })
      }

      const sectionsOf = (versionId: string) =>
        ctx.db.section.findMany({
          where: {
            chapter: { versionId, deletedAt: null },
            deletedAt: null,
            mergedIntoId: null,
          },
          orderBy: [{ chapter: { order: 'asc' } }, { order: 'asc' }],
          select: {
            id: true,
            lineageId: true,
            title: true,
            wordCount: true,
            chapter: { select: { title: true, order: true } },
            currentRevision: { select: { id: true, contentText: true } },
          },
        })

      const [left, right] = await Promise.all([
        sectionsOf(base.versionId),
        sectionsOf(target.versionId),
      ])

      const rightByLineage = new Map(right.map((section) => [section.lineageId, section]))
      const seen = new Set<string>()

      const sections = left.map((leftSection) => {
        const rightSection = rightByLineage.get(leftSection.lineageId)
        if (rightSection) seen.add(leftSection.lineageId)

        const identical =
          rightSection?.currentRevision?.id !== undefined &&
          rightSection.currentRevision.id === leftSection.currentRevision?.id

        return {
          lineageId: leftSection.lineageId,
          title: leftSection.title ?? leftSection.chapter.title,
          chapterOrder: leftSection.chapter.order,
          // `identical` is cheap and exact: the two versions share one revision
          // until somebody edits one of them (decision 0014).
          state: rightSection
            ? identical
              ? ('same' as const)
              : ('changed' as const)
            : ('removed' as const),
          baseRevisionId: leftSection.currentRevision?.id ?? null,
          targetRevisionId: rightSection?.currentRevision?.id ?? null,
          baseWords: leftSection.wordCount,
          targetWords: rightSection?.wordCount ?? 0,
        }
      })

      const added = right
        .filter((section) => !seen.has(section.lineageId))
        .map((section) => ({
          lineageId: section.lineageId,
          title: section.title ?? section.chapter.title,
          chapterOrder: section.chapter.order,
          state: 'added' as const,
          baseRevisionId: null,
          targetRevisionId: section.currentRevision?.id ?? null,
          baseWords: 0,
          targetWords: section.wordCount,
        }))

      const rows = [...sections, ...added].sort((a, b) => a.chapterOrder - b.chapterOrder)

      return {
        base: { id: base.versionId, isMain: base.isMain },
        target: { id: target.versionId, isMain: target.isMain },
        rows,
        stats: {
          same: rows.filter((row) => row.state === 'same').length,
          changed: rows.filter((row) => row.state === 'changed').length,
          added: rows.filter((row) => row.state === 'added').length,
          removed: rows.filter((row) => row.state === 'removed').length,
        },
      }
    }),

  /**
   * A suggestion against the text it would replace. FR-7.5's first case.
   *
   * A submitted suggestion has a stable id, but its content can still change
   * while it is a draft, so this is never cached — computing 2000 words is
   * inside the NFR-2 budget anyway.
   */
  suggestionAgainstHead: publicProcedure
    .input(z.object({ suggestionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const suggestion = await ctx.db.suggestion.findUnique({
        where: { id: input.suggestionId },
        select: {
          id: true,
          state: true,
          contentText: true,
          baseRevisionId: true,
          contributorId: true,
          request: {
            select: {
              storyboardId: true,
              section: { select: { id: true, currentRevisionId: true } },
            },
          },
        },
      })
      if (!suggestion) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }

      await loadStoryboard(ctx.db, actor, { id: suggestion.request.storyboardId })
      if (suggestion.state === 'DRAFT' && suggestion.contributorId !== actor?.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }

      const head = suggestion.request.section.currentRevisionId
      const current = head
        ? await ctx.db.revision.findUnique({
            where: { id: head },
            select: { id: true, contentText: true },
          })
        : null

      const result = compare(current?.contentText ?? '', suggestion.contentText)

      return {
        ...result,
        /** FR-6.7 — written against a revision that is no longer the head. */
        isStale: head !== suggestion.baseRevisionId,
        headRevisionId: head,
      }
    }),
})
