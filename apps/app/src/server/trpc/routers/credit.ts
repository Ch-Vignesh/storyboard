import { z } from 'zod'

import { loadStoryboard } from '@/lib/authz/guard'
import { CONTRIBUTORS_STRIP_MAX } from '@/lib/schemas/constants'
import { mainDraftOwnShare } from '@/server/own-share'
import { mainDraftPlaces, type Place } from '@/server/places'

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
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: { select: { updatedAt: true } },
            },
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
      const placeOf = lineages.length
        ? await mainDraftPlaces(ctx.db, storyboardId, lineages)
        : new Map<string, Place>()

      // Item 6.17 (decision 0041) — how much of the main draft is the author's
      // own words, said only where somebody else has words in it. A co-author
      // writes as the author, so a story with only co-authors says nothing.
      const contributed = credits.some((credit) => credit.type !== 'COAUTHOR')
      const ownShare = contributed ? await mainDraftOwnShare(ctx.db, storyboardId) : null

      return {
        ownShare,
        credits: credits.map((credit) => ({
          ...credit,
          place: credit.sectionLineage ? (placeOf.get(credit.sectionLineage) ?? null) : null,
        })),
        contributors: [...byContributor.values()],
      }
    }),

  /**
   * Phase 14, item 7.3 (FR-9.2) — the strip in the reader's margin, as the
   * prototype drew it: the most recent contributors first, each with their
   * latest credit or how many they have, and how many people there are in
   * all, for "All contributors". Only the shown credits' places are resolved.
   */
  strip: publicProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId } = await loadStoryboard(ctx.db, actor, { id: input.storyboardId })

      const credits = await ctx.db.credit.findMany({
        where: { storyboardId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          type: true,
          createdAt: true,
          sectionLineage: true,
          inheritedFromId: true,
          contributor: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: { select: { updatedAt: true } },
            },
          },
        },
      })

      // Newest first, so the first credit met for a person is their latest.
      // Erased people (decision 0013) are one line together, as on the page.
      const people = new Map<
        string,
        {
          contributor: (typeof credits)[number]['contributor']
          latest: (typeof credits)[number]
          count: number
        }
      >()
      for (const credit of credits) {
        const key = credit.contributor?.id ?? 'erased'
        const entry = people.get(key)
        if (entry) entry.count += 1
        else people.set(key, { contributor: credit.contributor, latest: credit, count: 1 })
      }

      const shown = [...people.values()].slice(0, CONTRIBUTORS_STRIP_MAX)
      const lineages = shown
        .map((entry) => entry.latest.sectionLineage)
        .filter((lineage): lineage is string => Boolean(lineage))
      const placeOf = lineages.length
        ? await mainDraftPlaces(ctx.db, storyboardId, lineages)
        : new Map<string, Place>()

      return {
        total: people.size,
        contributors: shown.map((entry) => ({
          contributor: entry.contributor,
          count: entry.count,
          latest: {
            type: entry.latest.type,
            createdAt: entry.latest.createdAt,
            inherited: entry.latest.inheritedFromId !== null,
            place: entry.latest.sectionLineage
              ? (placeOf.get(entry.latest.sectionLineage) ?? null)
              : null,
          },
        })),
      }
    }),
})
