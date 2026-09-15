import { z } from 'zod'

import { loadStoryboard } from '@/lib/authz/guard'

import { actorFrom, createTRPCRouter, publicProcedure } from '../init'

/**
 * Credit (FR-9.1, FR-9.2). A credit is permanent and visible: removing the text
 * does not remove the record of the contribution (principle 1.3.3), which is
 * why `isLive` exists and nothing here ever deletes a row.
 */
export const creditRouter = createTRPCRouter({
  /** The contributors strip: avatars with counts, on every storyboard page. */
  forStoryboard: publicProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId } = await loadStoryboard(ctx.db, actor, { id: input.storyboardId })

      const credits = await ctx.db.credit.findMany({
        where: { storyboardId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          isLive: true,
          createdAt: true,
          sectionLineage: true,
          inheritedFromId: true,
          contributor: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      })

      // Group by contributor for the strip, keeping the full list for the
      // credits page (FR-9.2). Erased contributors (decision 0013) are counted
      // together rather than dropped: the contributions happened.
      const byContributor = new Map<
        string,
        { contributor: (typeof credits)[number]['contributor']; count: number; live: number }
      >()
      for (const credit of credits) {
        const key = credit.contributor?.id ?? 'erased'
        const entry = byContributor.get(key) ?? {
          contributor: credit.contributor,
          count: 0,
          live: 0,
        }
        entry.count += 1
        if (credit.isLive) entry.live += 1
        byContributor.set(key, entry)
      }

      /*
       * FR-9.6 — where each credit points, so it can be written into a
       * manuscript's front matter as plain text.
       *
       * A credit stores a `sectionLineage`, not a section id, because the
       * section it refers to is a lineage that survives edits, splits and
       * alternate versions (FR-8.2). Resolving it to an address therefore means
       * asking where that lineage sits in the **main** draft right now — which
       * is the only version a stranger following the link can read, and the
       * only one whose numbering is stable enough to print in a book.
       *
       * A lineage that no longer appears in the main draft resolves to nothing,
       * and the line is written without an address rather than with a wrong one.
       */
      const lineages = [...new Set(credits.map((credit) => credit.sectionLineage))].filter(
        (lineage): lineage is string => Boolean(lineage),
      )

      const sections = lineages.length
        ? await ctx.db.section.findMany({
            where: {
              lineageId: { in: lineages },
              deletedAt: null,
              chapter: { version: { storyboardId, isMain: true } },
            },
            select: {
              lineageId: true,
              order: true,
              chapter: { select: { order: true, title: true } },
            },
          })
        : []

      // Only when something actually resolved; the slug is otherwise unused.
      const slug = sections.length
        ? (
            await ctx.db.storyboard.findUniqueOrThrow({
              where: { id: storyboardId },
              select: { slug: true },
            })
          ).slug
        : ''

      const placeOf = new Map(
        sections.map((section) => [
          section.lineageId,
          {
            chapter: section.chapter.title,
            path: `/s/${slug}/c/${String(section.chapter.order + 1)}/${String(section.order + 1)}`,
          },
        ]),
      )

      return {
        credits: credits.map((credit) => ({
          ...credit,
          place: credit.sectionLineage ? (placeOf.get(credit.sectionLineage) ?? null) : null,
        })),
        contributors: [...byContributor.values()],
      }
    }),
})
