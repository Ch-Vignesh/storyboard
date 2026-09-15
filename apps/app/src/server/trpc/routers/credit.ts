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

      return { credits, contributors: [...byContributor.values()] }
    }),

  /** Everything this person has been credited for (FR-9.3, the feed). */
  forUser: publicProcedure
    .input(z.object({ username: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { username: input.username },
        select: { id: true, username: true, displayName: true, bio: true, createdAt: true },
      })
      if (!user) return null

      const credits = await ctx.db.credit.findMany({
        where: { contributorId: user.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          isLive: true,
          createdAt: true,
          storyboard: {
            select: {
              slug: true,
              title: true,
              visibility: true,
              owner: { select: { username: true, displayName: true } },
            },
          },
        },
      })

      // A private storyboard's title is not public, even in a credit line.
      const visible = credits.filter((credit) => credit.storyboard.visibility === 'PUBLIC')

      return { user, credits: visible }
    }),
})
