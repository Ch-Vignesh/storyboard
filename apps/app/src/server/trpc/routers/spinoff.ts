import type { Prisma } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { canReadStoryboard, loadStoryboard } from '@/lib/authz/guard'
import { publicId, slugify } from '@/lib/ids'
import { logger } from '@/lib/logger'
import { DAILY_LIMITS } from '@/lib/schemas/constants'
import { DAY_MS, enforce, key, whenToRetry } from '@/server/limits'
import { titleSchema } from '@/lib/schemas/storyboard'

import { copyTree } from './version'
import { actorFrom, createTRPCRouter, protectedProcedure, publicProcedure } from '../init'

const log = logger.child({ router: 'spinoff' })

/** FR-10.5 — the chain is shown three deep, with a link to the rest. */
const LINEAGE_SHOWN = 3

/**
 * Spin-offs (FR-10.3 to FR-10.7).
 *
 * A spin-off is a new storyboard owned by the person who made it. The original
 * author is **notified, not asked**: a public storyboard is public, and FR-13.6
 * already says plainly that anyone can copy what they read. Pretending
 * permission is required would be a protection the product cannot deliver.
 *
 * A spin-off does not track the original (FR-10.4). Later chapters the original
 * author writes do not appear, and the banner says so — the honest, cheap
 * answer, where live tracking is deferred indefinitely.
 */
export const spinOffRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        storyboardId: z.string().min(1),
        versionId: z.string().min(1).optional(),
        title: titleSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const userId = ctx.session.user.id

      // FR-10.7 is enforced inside `can()`: spinning off requires a public
      // storyboard, for authors as much as for anyone else.
      const { storyboardId } = await loadStoryboard(
        ctx.db,
        actor,
        { id: input.storyboardId },
        'storyboard:spinOff',
      )

      const original = await ctx.db.storyboard.findUniqueOrThrow({
        where: { id: storyboardId },
        select: {
          id: true,
          title: true,
          logline: true,
          type: true,
          ownerId: true,
          slug: true,
          genres: { select: { genreId: true } },
        },
      })

      // FR-13.3 — one spin-off of a given storyboard per person per day.
      await enforce(
        ctx.db,
        key.spinOff(userId, storyboardId),
        { limit: DAILY_LIMITS.spinOffsPerStoryboard, windowMs: DAY_MS },
        (retryAt) =>
          `You have already started your own version of this story today. You can start another ${whenToRetry(retryAt)}.`,
      )

      const source = await ctx.db.version.findFirst({
        where: input.versionId
          ? { id: input.versionId, storyboardId }
          : { storyboardId, isMain: true },
        select: { id: true },
      })
      if (!source) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That version does not exist.' })
      }

      const title = input.title?.trim() ?? original.title
      const id = publicId()
      const now = new Date()

      const created = await ctx.db.$transaction(async (tx) => {
        // FR-10.3 — what the original looked like at this moment, answerable
        // forever without keeping the original's later state.
        const sections = await tx.section.findMany({
          where: {
            chapter: { versionId: source.id, deletedAt: null },
            deletedAt: null,
            mergedIntoId: null,
          },
          select: { lineageId: true, currentRevisionId: true },
        })
        const revisionMap: Record<string, string> = {}
        for (const section of sections) {
          if (section.currentRevisionId) revisionMap[section.lineageId] = section.currentRevisionId
        }

        const spinOff = await tx.storyboard.create({
          data: {
            publicId: id,
            slug: `${slugify(title)}-${id}`,
            title,
            logline: original.logline,
            type: original.type,
            // A spin-off starts private: it is a draft of somebody's own, and
            // FR-2.7's copying warning should be a choice they make knowingly.
            visibility: 'PRIVATE',
            ownerId: userId,
            forkedFromId: original.id,
            forkedFromVersionId: source.id,
            forkedAt: now,
            forkedRevisionMap: revisionMap,
            genres: { create: original.genres.map((entry) => ({ genreId: entry.genreId })) },
          },
          select: { id: true, slug: true, publicId: true },
        })

        const version = await tx.version.create({
          data: {
            storyboardId: spinOff.id,
            name: 'Main draft',
            isMain: true,
            baseVersionId: source.id,
            createdById: userId,
          },
          select: { id: true },
        })

        await copyTree(tx, source.id, version.id)

        // FR-9.5 — credits survive a spin-off. Each is copied with
        // `inheritedFromId` pointing at the credit it came from, so the
        // spin-off's credits page can show what was inherited and what was
        // earned since.
        const credits = await tx.credit.findMany({
          where: { storyboardId: original.id },
          select: {
            id: true,
            contributorId: true,
            type: true,
            sectionLineage: true,
            revisionId: true,
            suggestionId: true,
            ideaId: true,
            isLive: true,
            erasedAt: true,
            createdAt: true,
          },
        })
        if (credits.length > 0) {
          await tx.credit.createMany({
            data: credits.map((credit) => ({
              storyboardId: spinOff.id,
              // Decision 0013: an erased credit stays erased in every copy.
              contributorId: credit.erasedAt ? null : credit.contributorId,
              erasedAt: credit.erasedAt,
              type: credit.type,
              sectionLineage: credit.sectionLineage,
              revisionId: credit.revisionId,
              suggestionId: credit.suggestionId,
              ideaId: credit.ideaId,
              isLive: credit.isLive,
              inheritedFromId: credit.id,
              createdAt: credit.createdAt,
            })),
          })
        }

        return spinOff
      })

      // FR-10.3 — the original author is told. After the transaction.
      await ctx.db.notification.create({
        data: {
          userId: original.ownerId,
          type: 'SPIN_OFF_CREATED',
          payload: {
            storyboardId: created.id,
            slug: original.slug,
            title: original.title,
          },
        },
      })

      log.info(
        { event: 'spinoff.created', spinOffId: created.id, originalId: original.id, userId },
        'spin-off created',
      )
      return created
    }),

  /**
   * FR-10.5 — the lineage chain, truncated to three ancestors.
   *
   * Walked one row at a time rather than with a recursive CTE: a chain is a
   * handful of rows, the cap is small, and a loop is the version anyone can
   * check. The guard against a cycle is belt and braces — a spin-off always
   * points at something older than itself.
   */
  lineage: publicProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId } = await loadStoryboard(ctx.db, actor, { id: input.storyboardId })

      const ancestors: Array<{
        id: string
        /** Null when the ancestor is not this reader's to see; nothing links. */
        slug: string | null
        title: string
        visibility: 'PUBLIC' | 'PRIVATE'
        forkedAt: Date | null
        /** FR-10.4 — only claim the original "has continued since" when it has. */
        continuedSince: boolean
        owner: { username: string | null; displayName: string | null } | null
        /** True when the row is redacted: it exists, and that is all we say. */
        hidden: boolean
      }> = []

      const seen = new Set<string>([storyboardId])
      let cursor: string | null = (
        await ctx.db.storyboard.findUniqueOrThrow({
          where: { id: storyboardId },
          select: { forkedFromId: true },
        })
      ).forkedFromId

      let ownForkedAt: Date | null = (
        await ctx.db.storyboard.findUniqueOrThrow({
          where: { id: storyboardId },
          select: { forkedAt: true },
        })
      ).forkedAt

      while (cursor && ancestors.length < 20 && !seen.has(cursor)) {
        seen.add(cursor)
        const row: {
          id: string
          slug: string
          title: string
          visibility: 'PUBLIC' | 'PRIVATE'
          deletedAt: Date | null
          forkedFromId: string | null
          forkedAt: Date | null
          owner: { username: string | null; displayName: string | null }
        } | null = await ctx.db.storyboard.findUnique({
          where: { id: cursor },
          select: {
            id: true,
            slug: true,
            title: true,
            visibility: true,
            deletedAt: true,
            forkedFromId: true,
            forkedAt: true,
            owner: { select: { username: true, displayName: true } },
          },
        })
        if (!row) break

        // An ancestor is somebody else's storyboard, and it may have gone
        // private or been deleted since the spin-off was taken. The chain still
        // has to show that a link in it exists — FR-10.5's honesty about
        // provenance is the whole point — but a title, a slug and an author are
        // exactly what a private storyboard is entitled to keep.
        const readable = await canReadStoryboard(ctx.db, actor, { id: row.id })
        if (!readable) {
          ancestors.push({
            id: row.id,
            slug: null,
            title: 'a storyboard that is no longer public',
            visibility: row.visibility,
            forkedAt: ownForkedAt,
            continuedSince: false,
            owner: null,
            hidden: true,
          })
          ownForkedAt = row.forkedAt
          cursor = row.forkedFromId
          continue
        }

        // The banner in FR-10.4 asserts that the original has moved on. It is
        // only true if somebody wrote in it after the spin-off was taken, and a
        // banner that says so falsely is worse than no banner.
        const continuedSince =
          ownForkedAt !== null &&
          (await ctx.db.revision.count({
            where: {
              createdAt: { gt: ownForkedAt },
              section: { chapter: { version: { storyboardId: row.id } } },
            },
            take: 1,
          })) > 0

        ancestors.push({
          id: row.id,
          slug: row.slug,
          title: row.title,
          visibility: row.visibility,
          forkedAt: ownForkedAt,
          continuedSince,
          owner: row.owner,
          hidden: false,
        })
        ownForkedAt = row.forkedAt
        cursor = row.forkedFromId
      }

      return {
        /** Nearest first. The banner uses the first; the page shows this many. */
        ancestors: ancestors.slice(0, LINEAGE_SHOWN),
        total: ancestors.length,
        truncated: ancestors.length > LINEAGE_SHOWN,
      }
    }),

  /** FR-10.6 — the original shows a count and a list. Authors cannot delete these. */
  listFor: publicProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId } = await loadStoryboard(ctx.db, actor, { id: input.storyboardId })

      const spinOffs = await ctx.db.storyboard.findMany({
        where: {
          forkedFromId: storyboardId,
          deletedAt: null,
          // A private spin-off is somebody's private draft. The count below is
          // honest about how many exist; the list only names the public ones.
          visibility: 'PUBLIC',
        },
        orderBy: { forkedAt: 'desc' },
        select: {
          id: true,
          slug: true,
          title: true,
          forkedAt: true,
          owner: { select: { username: true, displayName: true } },
        },
      })

      const total = await ctx.db.storyboard.count({
        where: { forkedFromId: storyboardId, deletedAt: null },
      })

      return { spinOffs, total, privateCount: total - spinOffs.length }
    }),
})

/** Shared shape for the notification payload, so the digest can build a URL. */
export type SpinOffPayload = Prisma.JsonObject & {
  storyboardId: string
  slug: string
  title: string
}
