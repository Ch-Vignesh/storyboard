import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { canReadStoryboard } from '@/lib/authz/guard'
import { logger } from '@/lib/logger'
import { DAILY_LIMITS, REPORTS_TO_SUSPEND } from '@/lib/schemas/constants'
import { createReportSchema, REPORT_COPY } from '@/lib/schemas/report'
import { DAY_MS, enforce, key, whenToRetry } from '@/server/limits'

import { activeProcedure, createTRPCRouter } from '../init'

const log = logger.child({ router: 'report' })

/**
 * FR-13.5 — reporting.
 *
 * Three rules shape everything here:
 *
 * 1. **Counts are never public.** Not on a profile, not in an error message,
 *    not by inference. A report tells you nothing except that it was recorded.
 * 2. **One report per reporter per target.** The database enforces it; this
 *    treats the collision as success, because telling somebody "you already
 *    reported this" is fine and telling them "that failed" is not.
 * 3. **Ten upheld reports suspend the account pending review** — upheld, not
 *    filed. Filing is free; upholding is a person's decision. A brigade can
 *    generate a hundred reports and suspend nobody.
 */
export const reportRouter = createTRPCRouter({
  create: activeProcedure.input(createReportSchema).mutation(async ({ ctx, input }) => {
    const reporterId = ctx.session.user.id

    const target = await resolveTarget(ctx.db, reporterId, input.targetType, input.targetId)
    if (!target) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'That does not exist.' })
    }
    if (target.ownerId === reporterId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'You cannot report your own work.',
      })
    }

    // FR-13.3 — not in the requirement's list, but a reporting endpoint with no
    // ceiling is a harassment tool: the queue is a person's time. Counted after
    // the target is known to exist, so probing for things that do not exist
    // cannot burn somebody's allowance.
    await enforce(
      ctx.db,
      key.reportsMade(reporterId),
      { limit: DAILY_LIMITS.reportsMade, windowMs: DAY_MS },
      (retryAt) => `You have reported a lot today. Try again ${whenToRetry(retryAt)}.`,
    )

    const existing = await ctx.db.report.findUnique({
      where: {
        reporterId_targetType_targetId: {
          reporterId,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
      select: { id: true },
    })
    if (existing) return { status: 'duplicate' as const, message: REPORT_COPY.duplicate }

    await ctx.db.report.create({
      data: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        category: input.category,
        note: input.note ?? null,
      },
    })

    // NFR-7 — a report is one of the socially consequential moments. The
    // reporter is in the log because a pattern of reports is itself a signal;
    // it is never in anything a user can see.
    log.info(
      {
        event: 'report.created',
        targetType: input.targetType,
        targetId: input.targetId,
        category: input.category,
        reporterId,
      },
      'report filed',
    )

    return { status: 'filed' as const, message: REPORT_COPY.thanks }
  }),

  /**
   * Whether this person has already reported this thing, so the interface can
   * say so instead of offering an action that will be swallowed.
   *
   * Their own report only. Anything else would be a count, and counts are not
   * public (FR-13.5).
   */
  mine: activeProcedure
    .input(
      z.object({
        targetType: z.enum(['USER', 'STORYBOARD', 'SUGGESTION', 'IDEA']),
        targetId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const existing = await ctx.db.report.findUnique({
        where: {
          reporterId_targetType_targetId: {
            reporterId: ctx.session.user.id,
            targetType: input.targetType,
            targetId: input.targetId,
          },
        },
        select: { id: true, createdAt: true },
      })
      return { reported: existing !== null, at: existing?.createdAt ?? null }
    }),
})

/**
 * Who a report is *about*, which is not always who the target belongs to.
 *
 * A report against a suggestion is a report against its contributor; against a
 * storyboard, against its owner. Suspension counts against the person, so the
 * queue needs to know who that is — and it has to be resolved at report time,
 * because the row may be gone by the time anyone reads the queue.
 */
async function resolveTarget(
  db: Parameters<typeof canReadStoryboard>[0],
  actorId: string,
  targetType: 'USER' | 'STORYBOARD' | 'SUGGESTION' | 'IDEA',
  targetId: string,
): Promise<{ ownerId: string } | null> {
  const actor = { id: actorId }

  switch (targetType) {
    case 'USER': {
      const user = await db.user.findUnique({ where: { id: targetId }, select: { id: true } })
      return user ? { ownerId: user.id } : null
    }
    case 'STORYBOARD': {
      const storyboard = await db.storyboard.findUnique({
        where: { id: targetId },
        select: { id: true, ownerId: true },
      })
      if (!storyboard) return null
      // You cannot report what you cannot see. Otherwise reporting becomes a
      // way to ask whether a private storyboard exists.
      if (!(await canReadStoryboard(db, actor, { id: storyboard.id }))) return null
      return { ownerId: storyboard.ownerId }
    }
    case 'SUGGESTION': {
      const suggestion = await db.suggestion.findUnique({
        where: { id: targetId },
        select: {
          contributorId: true,
          request: {
            select: {
              section: {
                select: { chapter: { select: { version: { select: { storyboardId: true } } } } },
              },
            },
          },
        },
      })
      if (!suggestion) return null
      const storyboardId = suggestion.request.section.chapter.version.storyboardId
      if (!(await canReadStoryboard(db, actor, { id: storyboardId }))) return null
      return { ownerId: suggestion.contributorId }
    }
    case 'IDEA': {
      const idea = await db.idea.findUnique({
        where: { id: targetId },
        select: {
          authorId: true,
          request: {
            select: {
              section: {
                select: { chapter: { select: { version: { select: { storyboardId: true } } } } },
              },
            },
          },
        },
      })
      if (!idea) return null
      const storyboardId = idea.request.section.chapter.version.storyboardId
      if (!(await canReadStoryboard(db, actor, { id: storyboardId }))) return null
      return { ownerId: idea.authorId }
    }
  }
}

/** Exported for the admin router, which upholds reports and counts to ten. */
export const SUSPEND_AT = REPORTS_TO_SUSPEND
