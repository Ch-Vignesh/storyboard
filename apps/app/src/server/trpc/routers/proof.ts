import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadRevisionRecord } from '@/lib/authz/guard'

import { actorFrom, createTRPCRouter, publicProcedure } from '../init'

/**
 * FR-13.6 (phase 14, item 8.12; D-11) — a proof of authorship anyone can
 * check. Not a signed document: the public record of one saved version, read
 * from the row the database will not let anyone change (NFR-3), at an
 * address the writer can hand to anyone.
 */
export const proofRouter = createTRPCRouter({
  /**
   * One version's record. Public, because a record only the writer can open
   * proves nothing to anybody else; what it may say about the story is
   * decided at the data layer (`loadRevisionRecord`).
   */
  get: publicProcedure
    .input(z.object({ revisionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const record = await loadRevisionRecord(ctx.db, actor, input.revisionId)
      if (!record) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'There is no record at this address.' })
      }
      return record
    }),
})
