import { z } from 'zod'

import { targetsFor } from '@/server/notification-targets'

import { activeProcedure, createTRPCRouter, protectedProcedure } from '../init'

/**
 * The in-app notification centre (FR-12.1). In-app cannot be disabled; email
 * and per-type toggles arrive in phase 3, which is also where the batching
 * rules in FR-12.3 live.
 */
export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ take: z.number().int().min(1).max(100).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const rows = await ctx.db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: input?.take ?? 30,
        select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
      })
      // The payload stays on the server: it holds ids, and what the row
      // links to and names is decided against what this person may read.
      const targets = await targetsFor(ctx.db, userId, rows)
      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        readAt: row.readAt,
        createdAt: row.createdAt,
        ...(targets.get(row.id) ?? { path: null, title: null }),
      }))
    }),

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
