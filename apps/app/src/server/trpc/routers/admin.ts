import type { Prisma, PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { REPORTS_TO_SUSPEND } from '@/lib/schemas/constants'
import { nameOf } from '@/lib/people'

import { adminProcedure, createTRPCRouter } from '../init'

const log = logger.child({ router: 'admin' })

/**
 * FR-13.7 and FR-15.5 — moderation is the owner's own time in v1.
 *
 * Everything here is designed around that sentence. The queue is one list with
 * two decisions per row, the decisions are reversible, and nothing asks the
 * moderator to write anything. A moderation tool that needs a training document
 * is a tool that will not be used at eleven at night by the one person who has
 * to use it.
 *
 * Every procedure is `adminProcedure`, which 404s a non-admin rather than
 * forbidding them: an admin screen is not a thing to be told about.
 */
export const adminRouter = createTRPCRouter({
  /** The queue. Open reports first, oldest first — a queue, not a feed. */
  reports: adminProcedure
    .input(
      z.object({
        state: z.enum(['OPEN', 'UPHELD', 'DISMISSED']).default('OPEN'),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const reports = await ctx.db.report.findMany({
        where: { state: input.state },
        orderBy: { createdAt: 'asc' },
        take: input.limit,
        select: {
          id: true,
          targetType: true,
          targetId: true,
          category: true,
          note: true,
          state: true,
          createdAt: true,
          resolvedAt: true,
          reporter: { select: { id: true, username: true, displayName: true } },
          resolvedBy: { select: { username: true, displayName: true } },
        },
      })

      // What each report is actually about, resolved here rather than in the
      // component: a moderator should not have to open four tabs to see what
      // they are deciding on.
      const detailed = await Promise.all(
        reports.map(async (report) => ({
          ...report,
          reporterName: nameOf(report.reporter),
          subject: await describe(ctx.db, report.targetType, report.targetId),
        })),
      )

      const counts = await ctx.db.report.groupBy({ by: ['state'], _count: { _all: true } })

      return {
        reports: detailed,
        counts: Object.fromEntries(counts.map((row) => [row.state, row._count._all])),
      }
    }),

  /**
   * Uphold or dismiss. One key each in the interface, and reversible: FR-13.7
   * says suspension is reversible, and a decision you cannot undo is one people
   * hesitate over, which makes the queue longer.
   *
   * Upholding is what counts towards FR-13.5's ten. Filing does not.
   */
  decide: adminProcedure
    .input(
      z.object({
        reportId: z.string().min(1),
        decision: z.enum(['UPHELD', 'DISMISSED', 'OPEN']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.session.user.id

      const report = await ctx.db.report.findUnique({
        where: { id: input.reportId },
        select: { id: true, targetType: true, targetId: true, state: true },
      })
      if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such report.' })

      await ctx.db.report.update({
        where: { id: report.id },
        data:
          input.decision === 'OPEN'
            ? { state: 'OPEN', resolvedAt: null, resolvedById: null }
            : { state: input.decision, resolvedAt: new Date(), resolvedById: adminId },
      })

      // FR-13.5 — ten upheld against one person suspends them pending review.
      // Counted against the *person*, which is why reports resolve to an owner.
      const subject = await subjectUserId(ctx.db, report.targetType, report.targetId)
      let suspended = false
      if (subject && input.decision === 'UPHELD') {
        const upheld = await countUpheldAgainst(ctx.db, subject)
        if (upheld >= REPORTS_TO_SUSPEND) {
          const user = await ctx.db.user.findUnique({
            where: { id: subject },
            select: { status: true },
          })
          if (user?.status === 'ACTIVE') {
            await ctx.db.user.update({
              where: { id: subject },
              data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedById: adminId },
            })
            suspended = true
            log.warn(
              { event: 'admin.auto_suspended', userId: subject, upheld },
              'account suspended by upheld report count',
            )
          }
        }
      }

      log.info(
        { event: 'admin.report_decided', reportId: report.id, decision: input.decision, adminId },
        'report decided',
      )
      return { decision: input.decision, suspended }
    }),

  /** Suspend or restore by hand. FR-13.7 — reversible, and it says who did it. */
  setUserStatus: adminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        status: z.enum(['ACTIVE', 'SUSPENDED']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.session.user.id
      if (input.userId === adminId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot suspend yourself.' })
      }

      const user = await ctx.db.user.update({
        where: { id: input.userId },
        data:
          input.status === 'SUSPENDED'
            ? { status: 'SUSPENDED', suspendedAt: new Date(), suspendedById: adminId }
            : { status: 'ACTIVE', suspendedAt: null, suspendedById: null },
        select: { id: true, username: true, displayName: true, status: true },
      })

      log.warn(
        { event: 'admin.user_status', userId: user.id, status: input.status, adminId },
        'account status changed by hand',
      )
      // Decision 0018 — the work is untouched. Nothing else happens here.
      return user
    }),

  /** Who this is, and what has been upheld against them. Admin eyes only. */
  user: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          status: true,
          suspendedAt: true,
          createdAt: true,
          suspendedBy: { select: { username: true, displayName: true } },
          _count: { select: { storyboards: true, suggestions: true, ideas: true } },
        },
      })
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such person.' })

      return { ...user, upheld: await countUpheldAgainst(ctx.db, user.id) }
    }),

  /** FR-15.5 — the seeded-content manager. What is seeded, and is it labelled. */
  seeded: adminProcedure.query(async ({ ctx }) => {
    const storyboards = await ctx.db.storyboard.findMany({
      where: { isSeed: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        visibility: true,
        state: true,
        createdAt: true,
        owner: { select: { username: true, displayName: true } },
        genres: { select: { genre: { select: { name: true } } } },
        _count: { select: { versions: true } },
      },
    })

    // FR-15.4's targets, so the screen can say how far off launch is.
    const genres = new Set(
      storyboards.flatMap((storyboard) => storyboard.genres.map((entry) => entry.genre.name)),
    )
    const openRequests = await ctx.db.contributionRequest.count({
      where: { state: 'OPEN', section: { chapter: { version: { storyboard: { isSeed: true } } } } },
    })
    const answered = await ctx.db.contributionRequest.count({
      where: {
        state: { in: ['ANSWERED', 'RESOLVED'] },
        section: { chapter: { version: { storyboard: { isSeed: true } } } },
      },
    })

    return {
      storyboards,
      progress: {
        storyboards: { have: storyboards.length, want: 25 },
        genres: { have: genres.size, want: 6 },
        openRequests: { have: openRequests, want: 40 },
        answeredRequests: { have: answered, want: 15 },
      },
    }
  }),

  /** FR-15.5 — feature flags, readable by anyone, writable here. */
  flags: adminProcedure.query(({ ctx }) =>
    ctx.db.featureFlag.findMany({ orderBy: { key: 'asc' } }),
  ),

  setFlag: adminProcedure
    .input(
      z.object({
        key: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .regex(/^[a-z][a-z0-9-]*$/u, 'Lower case, digits and hyphens.'),
        enabled: z.boolean(),
        description: z.string().trim().min(1).max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const flag = await ctx.db.featureFlag.upsert({
        where: { key: input.key },
        create: {
          key: input.key,
          enabled: input.enabled,
          description: input.description,
          updatedById: ctx.session.user.id,
        },
        update: {
          enabled: input.enabled,
          description: input.description,
          updatedById: ctx.session.user.id,
        },
      })
      log.info(
        { event: 'admin.flag_set', key: flag.key, enabled: flag.enabled },
        'feature flag changed',
      )
      return flag
    }),
})

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Upheld reports against one person, across every kind of target.
 *
 * There is no `Report.subjectUserId` column: a report points at the thing, not
 * the person. So this resolves the other way — find everything of theirs that
 * could have been reported, and count upheld reports against those ids. It is
 * a handful of indexed queries and it runs once per decision, not per page.
 */
async function countUpheldAgainst(db: Db, userId: string): Promise<number> {
  const [storyboards, suggestions, ideas] = await Promise.all([
    db.storyboard.findMany({ where: { ownerId: userId }, select: { id: true } }),
    db.suggestion.findMany({ where: { contributorId: userId }, select: { id: true } }),
    db.idea.findMany({ where: { authorId: userId }, select: { id: true } }),
  ])

  return db.report.count({
    where: {
      state: 'UPHELD',
      OR: [
        { targetType: 'USER', targetId: userId },
        { targetType: 'STORYBOARD', targetId: { in: storyboards.map((row) => row.id) } },
        { targetType: 'SUGGESTION', targetId: { in: suggestions.map((row) => row.id) } },
        { targetType: 'IDEA', targetId: { in: ideas.map((row) => row.id) } },
      ],
    },
  })
}

/** The person a report is about. */
async function subjectUserId(db: Db, targetType: string, targetId: string): Promise<string | null> {
  switch (targetType) {
    case 'USER':
      return targetId
    case 'STORYBOARD':
      return (
        (await db.storyboard.findUnique({ where: { id: targetId }, select: { ownerId: true } }))
          ?.ownerId ?? null
      )
    case 'SUGGESTION':
      return (
        (
          await db.suggestion.findUnique({
            where: { id: targetId },
            select: { contributorId: true },
          })
        )?.contributorId ?? null
      )
    case 'IDEA':
      return (
        (await db.idea.findUnique({ where: { id: targetId }, select: { authorId: true } }))
          ?.authorId ?? null
      )
    default:
      return null
  }
}

/** A one-line description of what a report is about, for the queue. */
async function describe(
  db: Db,
  targetType: string,
  targetId: string,
): Promise<{ label: string; href: string | null; excerpt: string | null }> {
  switch (targetType) {
    case 'USER': {
      const user = await db.user.findUnique({
        where: { id: targetId },
        select: { username: true, displayName: true, bio: true, status: true },
      })
      if (!user) return { label: 'a deleted account', href: null, excerpt: null }
      return {
        label: nameOf(user),
        href: user.username ? `/@${user.username}` : null,
        excerpt: user.bio,
      }
    }
    case 'STORYBOARD': {
      const storyboard = await db.storyboard.findUnique({
        where: { id: targetId },
        select: { title: true, slug: true, logline: true },
      })
      if (!storyboard) return { label: 'a deleted storyboard', href: null, excerpt: null }
      return {
        label: storyboard.title,
        href: `/s/${storyboard.slug}`,
        excerpt: storyboard.logline,
      }
    }
    case 'SUGGESTION': {
      const suggestion = await db.suggestion.findUnique({
        where: { id: targetId },
        select: { contentText: true, publicId: true },
      })
      if (!suggestion) return { label: 'a deleted suggestion', href: null, excerpt: null }
      return {
        label: 'a suggestion',
        href: null,
        excerpt: suggestion.contentText?.slice(0, 300) ?? null,
      }
    }
    case 'IDEA': {
      const idea = await db.idea.findUnique({
        where: { id: targetId },
        select: { body: true },
      })
      if (!idea) return { label: 'a deleted idea', href: null, excerpt: null }
      return { label: 'an idea', href: null, excerpt: idea.body.slice(0, 300) }
    }
    default:
      return { label: targetType, href: null, excerpt: null }
  }
}
