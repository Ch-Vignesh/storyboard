import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'

import { activeProcedure, createTRPCRouter, protectedProcedure } from '../init'

const log = logger.child({ router: 'block' })

/**
 * Decision 0046 (phase 14, item 2.9; D-9) — blocking a person. A small
 * version: someone you block still reads everything, cannot start, send or
 * post help on a story you own or co-write, and you hear nothing from them.
 * The refusals are in `lib/authz/guard.ts`, where every story's reads and
 * writes already go (NFR-6); this router only keeps the list.
 */
export const blockRouter = createTRPCRouter({
  /** Block, or unblock. Never yourself, and never an account that is gone. */
  set: activeProcedure
    .input(z.object({ userId: z.string().min(1), blocked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const blockerId = ctx.session.user.id
      if (input.userId === blockerId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot block yourself.' })
      }
      const target = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { status: true },
      })
      if (!target || target.status === 'DELETED') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No such person.' })
      }

      if (input.blocked) {
        await ctx.db.userBlock.upsert({
          where: { blockerId_blockedId: { blockerId, blockedId: input.userId } },
          create: { blockerId, blockedId: input.userId },
          update: {},
        })
      } else {
        await ctx.db.userBlock.deleteMany({ where: { blockerId, blockedId: input.userId } })
      }
      log.info(
        {
          event: input.blocked ? 'block.set' : 'block.lifted',
          userId: blockerId,
          blockedId: input.userId,
        },
        input.blocked ? 'person blocked' : 'block lifted',
      )
      return { userId: input.userId, blocked: input.blocked }
    }),

  /** The people you have blocked, newest first, for settings. */
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.userBlock.findMany({
      where: { blockerId: ctx.session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        blocked: { select: { id: true, username: true, displayName: true } },
      },
    }),
  ),
})
