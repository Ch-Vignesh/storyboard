import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { writtenWhilePrivate } from '@/lib/authz'
import { logger } from '@/lib/logger'
import { PROFILE_LISTS, USERNAME_CHARS } from '@/lib/schemas/constants'
import { activityCalendar } from '@/server/activity'

import { activeProcedure, actorFrom, createTRPCRouter, publicProcedure } from '../init'

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
const log = logger.child({ router: 'profile' })

export const profileRouter = createTRPCRouter({
  byUsername: publicProcedure
    .input(z.object({ username: z.string().min(1).max(USERNAME_CHARS.max) }))
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
          deletionRequestedAt: true,
          showPassedWork: true,
        },
      })
      // A deleted account has no profile, and neither has one on its way out
      // (decision 0024): the freeze is immediate, so the seven days before the
      // purge are not seven days of the profile still being there. Their
      // *work* stays throughout — this hides the person, not the writing.
      if (!user || user.status === 'DELETED' || user.deletionRequestedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No such profile.' })
      }

      const actor = actorFrom(ctx.session, ctx.account)
      const isSelf = actor?.id === user.id

      // Only public storyboards count anywhere on a profile: a private one's
      // title is not public, even inside somebody's contribution list.
      const publicOnly = { storyboard: { visibility: 'PUBLIC' as const, deletedAt: null } }
      // Their own credits, not the copies a spin-off inherits (FR-10.4): one
      // piece of writing was counted once for the story and again for every
      // spin-off of it, until the 2026-10-16 spec review. The spin-off's own
      // contributors page still names them.
      const theirs = { contributorId: user.id, inheritedFromId: null, ...publicOnly }

      const [authored, credits, spinOffs, proseCount, ideaCount] = await Promise.all([
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
          where: theirs,
          orderBy: { createdAt: 'desc' },
          take: PROFILE_LISTS.credits,
          select: {
            id: true,
            type: true,
            isLive: true,
            createdAt: true,
            sectionLineage: true,
            suggestion: {
              select: { publicId: true, wordCount: true, contentText: true, submittedAt: true },
            },
            idea: { select: { body: true } },
            storyboard: {
              select: {
                slug: true,
                title: true,
                publicFrom: true,
                privateSpans: { select: { startedAt: true, endedAt: true } },
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
        // Counted, not taken from the page of credits shown: the counts
        // stopped at that page's length until the 2026-10-16 spec review.
        ctx.db.credit.count({ where: { ...theirs, type: 'PROSE' } }),
        ctx.db.credit.count({ where: { ...theirs, type: 'IDEA' } }),
      ])

      // FR-9.4 — written but not used. The author always sees their own; anyone
      // else sees them only if the author has chosen to show them.
      const showPassed = isSelf || user.showPassedWork
      const passed = showPassed
        ? await ctx.db.suggestion.findMany({
            where: { contributorId: user.id, state: 'PASSED', request: publicOnly },
            orderBy: { decidedAt: 'desc' },
            take: PROFILE_LISTS.passed,
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
          // To the account holder only. Decision 0018 rejected telling anyone
          // else: it publishes an accusation nobody has upheld, on a page with
          // other people's names on it. Every visitor was told until the
          // phase 12 audit.
          suspended: isSelf && user.status === 'SUSPENDED',
        },
        isSelf,
        /** FR-9.3 — the four counts the profile leads with. */
        counts: {
          authored: authored.length,
          prose: proseCount,
          ideas: ideaCount,
          spinOffs,
        },
        authored,
        // Decision 0007: a contribution sent while its story was private is
        // still credited here, but its words stay private to the people who
        // could read them then. Shown to everyone until the phase 12 audit.
        credits: credits.map(({ storyboard: { privateSpans, ...storyboard }, ...credit }) => {
          const sent = credit.suggestion?.submittedAt
          // Before the story was first public, or in a stretch it spent private
          // again (decision 0039). No `publicFrom` on a public story is bad
          // data, and counts as private: hide rather than leak.
          const privateThen =
            !isSelf &&
            sent &&
            writtenWhilePrivate({ publicFrom: storyboard.publicFrom, privateSpans }, sent)
          const shown = { ...credit, storyboard }
          return privateThen && shown.suggestion
            ? { ...shown, suggestion: { ...shown.suggestion, contentText: '' } }
            : shown
        }),
        passed,
        showPassed,
        canTogglePassed: isSelf,
        passedIsPublic: user.showPassedWork,
        calendar,
      }
    }),

  /** FR-9.4 — the author's own choice about their unused work. */
  setPassedWorkVisible: activeProcedure
    .input(z.object({ visible: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { showPassedWork: input.visible },
        select: { showPassedWork: true },
      }),
    ),

  /**
   * Decision 0013 (OD-3) — erase a contribution record.
   *
   * The person goes; the writing stays. The prose was accepted into somebody
   * else's manuscript and is theirs now (FR-8.1 records both halves of that),
   * so removing it would let one person silently alter another's draft months
   * later. What is erased is the personal data: the name, the link, and the
   * entry on this profile.
   *
   * One-way, and the interface says so before it is done.
   */
  eraseContribution: activeProcedure
    .input(z.object({ creditId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const credit = await ctx.db.credit.findUnique({
        where: { id: input.creditId },
        select: { id: true, contributorId: true, revisionId: true, erasedAt: true },
      })
      if (credit?.contributorId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That contribution does not exist.' })
      }
      if (credit.erasedAt) return { creditId: credit.id, alreadyErased: true }

      // Inherited copies in spin-offs are the same contribution (FR-9.5), so
      // they are erased together. Anything else would leave the name standing
      // in a copy of the storyboard the person has never seen. The whole
      // family, not one step of it: up to the original, then every copy of
      // it, however many spin-offs deep. Until the phase 12 audit only direct
      // copies went, so a spin-off of a spin-off kept the name, and erasing
      // from a copy left the original named.
      const family = await ctx.db.$queryRaw<Array<{ id: string; revisionId: string | null }>>`
        WITH RECURSIVE up AS (
          SELECT id, "inheritedFromId" FROM "Credit" WHERE id = ${credit.id}
          UNION
          SELECT c.id, c."inheritedFromId" FROM "Credit" c JOIN up ON c.id = up."inheritedFromId"
        ),
        down AS (
          SELECT id, "revisionId", "contributorId" FROM "Credit"
          WHERE id IN (SELECT id FROM up WHERE "inheritedFromId" IS NULL) OR id = ${credit.id}
          UNION
          SELECT c.id, c."revisionId", c."contributorId" FROM "Credit" c
          JOIN down ON c."inheritedFromId" = down.id
        )
        SELECT id, "revisionId" FROM down WHERE "contributorId" = ${userId}`
      const inherited = family.filter((entry) => entry.id !== credit.id)
      const creditIds = family.map((entry) => entry.id)
      const revisionIds = family
        .map((entry) => entry.revisionId)
        .filter((id): id is string => id !== null)

      const now = new Date()
      await ctx.db.$transaction(async (tx) => {
        await tx.credit.updateMany({
          where: { id: { in: creditIds } },
          data: { contributorId: null, erasedAt: now },
        })

        if (revisionIds.length > 0) {
          // NFR-3 permits exactly this and nothing else; the trigger checks
          // every other column itself (decision 0013).
          await tx.$executeRawUnsafe("select set_config('storyboard.erase_authorship', 'on', true)")
          await tx.revision.updateMany({
            where: { id: { in: revisionIds }, authorId: userId },
            data: { authorId: null },
          })
        }
      })

      log.info(
        { event: 'credit.erased', creditId: credit.id, copies: inherited.length },
        'contribution record erased',
      )
      return { creditId: credit.id, alreadyErased: false }
    }),

  /**
   * FR-9.6 — a credit line as plain text, for a manuscript's front matter.
   *
   * Plain text and not a download: it is meant to be pasted into the front of a
   * document, and the permanent URL is the part that matters.
   */
  creditLines: publicProcedure
    .input(z.object({ username: z.string().min(1).max(USERNAME_CHARS.max) }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { username: input.username },
        select: {
          id: true,
          username: true,
          displayName: true,
          status: true,
          deletionRequestedAt: true,
        },
      })
      // The same answer as the profile itself (decision 0024): an account
      // being deleted has no profile, so it has no credit lines either. This
      // went on serving them until the phase 12 audit.
      if (!user || user.status === 'DELETED' || user.deletionRequestedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No such profile.' })
      }

      const credits = await ctx.db.credit.findMany({
        where: {
          contributorId: user.id,
          // Not a spin-off's inherited copy: its line named the spin-off's
          // owner as the author they had written for (2026-10-16 review).
          inheritedFromId: null,
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
