import { z } from 'zod'

import { activeProcedure, createTRPCRouter, protectedProcedure } from '../init'

/**
 * The in-app notification centre (FR-12.1). In-app cannot be disabled; email
 * and per-type toggles arrive in phase 3, which is also where the batching
 * rules in FR-12.3 live.
 */
export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ take: z.number().int().min(1).max(100).default(30) }).optional())
    .query(({ ctx, input }) =>
      ctx.db.notification.findMany({
        where: { userId: ctx.session.user.id },
        orderBy: { createdAt: 'desc' },
        take: input?.take ?? 30,
        select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
      }),
    ),

  unreadCount: protectedProcedure.query(({ ctx }) =>
    ctx.db.notification.count({
      where: { userId: ctx.session.user.id, readAt: null },
    }),
  ),

  markAllRead: activeProcedure.mutation(async ({ ctx }) => {
    await ctx.db.notification.updateMany({
      where: { userId: ctx.session.user.id, readAt: null },
      data: { readAt: new Date() },
    })
    return { ok: true }
  }),
})
