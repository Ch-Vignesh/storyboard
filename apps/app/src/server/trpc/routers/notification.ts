import { z } from 'zod'

import { NOTIFICATION_PAGE } from '@/lib/schemas/constants'
import { sentenceFor } from '@/lib/schemas/notifications'
import { targetsFor } from '@/server/notification-targets'

import { activeProcedure, createTRPCRouter, protectedProcedure } from '../init'

/**
 * The in-app notification centre (FR-12.1). In-app cannot be disabled; the
 * email toggles and the batching rules in FR-12.3 live with the digests.
 *
 * Phase 14, item 6.9 — a page at a time by cursor, read one row at a time,
 * and every row says who did what (`sentenceFor`), worked out when it is read
 * against what this person may read now.
 */
export const notificationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ cursor: z.string().min(1).nullish() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      // A cursor is one of this person's own rows, or it is no cursor at all:
      // somebody else's id neither pages their list nor says that it exists.
      const from = input.cursor
        ? await ctx.db.notification.findFirst({
            where: { id: input.cursor, userId },
            select: { id: true },
          })
        : null
      const rows = await ctx.db.notification.findMany({
        where: { userId },
        // Newest first; the id breaks a tie, so a cursor is exact.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: NOTIFICATION_PAGE + 1,
        ...(from ? { cursor: { id: from.id }, skip: 1 } : {}),
        select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
      })
      const page = rows.slice(0, NOTIFICATION_PAGE)
      // The payload stays on the server: it holds ids, and what the row links
      // to, names and says is decided against what this person may read.
      const targets = await targetsFor(ctx.db, userId, page)
      return {
        items: page.map((row) => {
          const target = targets.get(row.id)
          return {
            id: row.id,
            type: row.type,
            readAt: row.readAt,
            createdAt: row.createdAt,
            path: target?.path ?? null,
            title: target?.title ?? null,
            sentence: sentenceFor(row.type, target ?? {}),
          }
        }),
        nextCursor: rows.length > NOTIFICATION_PAGE ? (page[page.length - 1]?.id ?? null) : null,
      }
    }),

  unreadCount: protectedProcedure.query(({ ctx }) =>
    ctx.db.notification.count({
      where: { userId: ctx.session.user.id, readAt: null },
    }),
  ),

  /** Item 6.9 — the rows this person opened. Their own only; anyone else's are left as they are. */
  markRead: activeProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).min(1).max(NOTIFICATION_PAGE) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.notification.updateMany({
        where: { id: { in: input.ids }, userId: ctx.session.user.id, readAt: null },
        data: { readAt: new Date() },
      })
      return { marked: count }
    }),

  markAllRead: activeProcedure.mutation(async ({ ctx }) => {
    await ctx.db.notification.updateMany({
      where: { userId: ctx.session.user.id, readAt: null },
      data: { readAt: new Date() },
    })
    return { ok: true }
  }),
})
