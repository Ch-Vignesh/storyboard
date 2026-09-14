import { compare, type ComparisonResult } from '@storyboard/compare'
import type { PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadSection, loadStoryboard } from '@/lib/authz/guard'
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
      const actor = actorFrom(ctx.session)
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
   * A suggestion against the text it would replace. FR-7.5's first case.
   *
   * A submitted suggestion has a stable id, but its content can still change
   * while it is a draft, so this is never cached — computing 2000 words is
   * inside the NFR-2 budget anyway.
   */
  suggestionAgainstHead: publicProcedure
    .input(z.object({ suggestionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session)
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
