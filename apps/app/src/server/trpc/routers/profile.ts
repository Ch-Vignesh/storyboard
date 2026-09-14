import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { activityCalendar } from '@/server/activity'

import { actorFrom, createTRPCRouter, protectedProcedure, publicProcedure } from '../init'

/**
 * Profiles (FR-9.3, FR-9.4, FR-9.6).
 *
 * One public identity per account (OD-2, decision 0011): `username` owns the
 * URL and never changes, `displayName` is what the interface shows and the
 * writer controls.
 *
 * FR-9.4 is the careful part. Suggestions that were passed on are shown only to
 * their author unless that author opts to make them public. Defaulting them to
 * public would make being passed on feel punitive, which is the opposite of
 * what FR-6.10's "information, not a verdict" is trying to achieve.
 */
export const profileRouter = createTRPCRouter({
  byUsername: publicProcedure
    .input(z.object({ username: z.string().min(1).max(30) }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { username: input.username },
        select: {
          id: true,
          username: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          createdAt: true,
          status: true,
          showPassedWork: true,
        },
      })
      if (!user || user.status === 'DELETED') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No such profile.' })
      }

      const actor = actorFrom(ctx.session)
      const isSelf = actor?.id === user.id

      // Only public storyboards count anywhere on a profile: a private one's
      // title is not public, even inside somebody's contribution list.
      const publicOnly = { storyboard: { visibility: 'PUBLIC' as const, deletedAt: null } }

      const [authored, credits, spinOffs] = await Promise.all([
        ctx.db.storyboard.findMany({
          where: {
            ownerId: user.id,
            visibility: 'PUBLIC',
            deletedAt: null,
            forkedFromId: null,
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            slug: true,
            title: true,
            logline: true,
            type: true,
            isSeed: true,
            createdAt: true,
            requests: { where: { state: { in: ['OPEN', 'ANSWERED'] } }, select: { id: true } },
          },
        }),
        ctx.db.credit.findMany({
          where: { contributorId: user.id, ...publicOnly },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            id: true,
            type: true,
            isLive: true,
            createdAt: true,
            sectionLineage: true,
            suggestion: { select: { publicId: true, wordCount: true, contentText: true } },
            idea: { select: { body: true } },
            storyboard: {
              select: {
                slug: true,
                title: true,
                owner: { select: { username: true, displayName: true } },
              },
            },
          },
        }),
        ctx.db.storyboard.count({
          where: {
            ownerId: user.id,
            visibility: 'PUBLIC',
            deletedAt: null,
            forkedFromId: { not: null },
          },
        }),
      ])

      // FR-9.4 — written but not used. The author always sees their own; anyone
      // else sees them only if the author has chosen to show them.
      const showPassed = isSelf || user.showPassedWork
      const passed = showPassed
        ? await ctx.db.suggestion.findMany({
            where: { contributorId: user.id, state: 'PASSED', request: publicOnly },
            orderBy: { decidedAt: 'desc' },
            take: 50,
            select: {
              id: true,
              publicId: true,
              wordCount: true,
              decidedAt: true,
              passReason: true,
              request: {
                select: {
                  publicId: true,
                  title: true,
                  storyboard: { select: { slug: true, title: true } },
                },
              },
            },
          })
        : []

      const calendar = await activityCalendar(ctx.db, user.id)

      return {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
          suspended: user.status === 'SUSPENDED',
        },
        isSelf,
        /** FR-9.3 — the four counts the profile leads with. */
        counts: {
          authored: authored.length,
          prose: credits.filter((credit) => credit.type === 'PROSE').length,
          ideas: credits.filter((credit) => credit.type === 'IDEA').length,
          spinOffs,
        },
        authored,
        credits,
        passed,
        showPassed,
        canTogglePassed: isSelf,
        passedIsPublic: user.showPassedWork,
        calendar,
      }
    }),

  /** FR-9.4 — the author's own choice about their unused work. */
  setPassedWorkVisible: protectedProcedure
    .input(z.object({ visible: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { showPassedWork: input.visible },
        select: { showPassedWork: true },
      }),
    ),

  /**
   * FR-9.6 — a credit line as plain text, for a manuscript's front matter.
   *
   * Plain text and not a download: it is meant to be pasted into the front of a
   * document, and the permanent URL is the part that matters.
   */
  creditLines: publicProcedure
    .input(z.object({ username: z.string().min(1).max(30) }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { username: input.username },
        select: { id: true, username: true, displayName: true },
      })
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such profile.' })

      const credits = await ctx.db.credit.findMany({
        where: {
          contributorId: user.id,
          storyboard: { visibility: 'PUBLIC', deletedAt: null },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          type: true,
          createdAt: true,
          storyboard: {
            select: {
              slug: true,
              title: true,
              owner: { select: { username: true, displayName: true } },
            },
          },
        },
      })

      const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
      const name = user.displayName ?? user.username ?? 'Unknown'
      const role = { PROSE: 'contributing writer', IDEA: 'story consultant', COAUTHOR: 'co-author' }

      const lines = credits.map((credit) => {
        const date = credit.createdAt.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
        return `${name} — ${role[credit.type]} on “${credit.storyboard.title}” by ${
          credit.storyboard.owner.displayName ?? credit.storyboard.owner.username
        }, ${date}. ${base}/s/${credit.storyboard.slug}`
      })

      return { name, lines, text: lines.join('\n') }
    }),
})
