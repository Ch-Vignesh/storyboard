import type { Prisma, PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { writtenWhilePrivate } from '@/lib/authz'
import { PUBLICLY_LISTED } from '@/lib/authz/guard'
import { logger } from '@/lib/logger'
import { PROFILE_LISTS, USERNAME_CHARS } from '@/lib/schemas/constants'
import { timeZoneFromHeaders } from '@/lib/time-zone'
import { activityCalendar } from '@/server/activity'
import { HIDDEN_TEXT } from '@/server/hidden'
import { mainDraftOwnShares } from '@/server/own-share'
import { placesInMainDrafts } from '@/server/places'

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

/** The person a profile is of, or no profile. */
async function profileUser(db: PrismaClient, username: string) {
  const user = await db.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatar: { select: { updatedAt: true } },
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
  return user
}

/**
 * FR-9.3 — a person's own credits, on stories anyone may read: a private
 * story's title is not public, even inside somebody's contribution list. Not
 * the copies a spin-off inherits (FR-10.4): one piece of writing was counted
 * once for the story and again for every spin-off of it, until the 2026-10-16
 * spec review. The spin-off's own contributors page still names them.
 */
function ownCredits(userId: string) {
  return { contributorId: userId, inheritedFromId: null, storyboard: PUBLICLY_LISTED }
}

/** FR-9.4 — the suggestions an author passed on, on stories anyone may read. */
function passedBy(userId: string) {
  return {
    contributorId: userId,
    state: 'PASSED' as const,
    request: { storyboard: PUBLICLY_LISTED },
  }
}

const CREDIT_SELECT = {
  id: true,
  type: true,
  isLive: true,
  createdAt: true,
  sectionLineage: true,
  ideaId: true,
  storyboardId: true,
  suggestion: {
    select: {
      publicId: true,
      wordCount: true,
      contentText: true,
      submittedAt: true,
      hiddenAt: true,
      request: { select: { publicId: true } },
    },
  },
  idea: { select: { body: true, hiddenAt: true, request: { select: { publicId: true } } } },
  storyboard: {
    select: {
      slug: true,
      title: true,
      publicFrom: true,
      privateSpans: { select: { startedAt: true, endedAt: true } },
      owner: { select: { username: true, displayName: true } },
    },
  },
} satisfies Prisma.CreditSelect

/**
 * Phase 14, item 6.10 — a page of someone's credits, newest first, each with
 * where it reads now: the passage in the main draft for accepted prose, with
 * its chapter and section as the reader counts them; the suggestion's own
 * page once the passage has left the draft; the request, at the idea, for an
 * idea that helped; the story for a co-author. Decision 0007 and item 2.7
 * decide whose words are shown; the writer sees their own.
 */
async function creditsPage(
  db: PrismaClient,
  userId: string,
  isSelf: boolean,
  cursor: string | null | undefined,
) {
  // A cursor is one of their own credits, or it is no cursor at all.
  const from = cursor
    ? await db.credit.findFirst({
        where: { id: cursor, contributorId: userId },
        select: { id: true },
      })
    : null
  const rows = await db.credit.findMany({
    where: ownCredits(userId),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PROFILE_LISTS.credits + 1,
    ...(from ? { cursor: { id: from.id }, skip: 1 } : {}),
    select: CREDIT_SELECT,
  })
  const page = rows.slice(0, PROFILE_LISTS.credits)

  // Where each accepted passage reads now, across every story on the page.
  const prose = page.filter((credit) => credit.type === 'PROSE' && credit.sectionLineage !== null)
  const places = await placesInMainDrafts(
    db,
    [...new Set(prose.map((credit) => credit.storyboardId))],
    prose.map((credit) => credit.sectionLineage).filter((lineage): lineage is string => !!lineage),
  )

  // Item 8.12 (FR-13.6) — the public record of the version each passage
  // became, for the writer's own view; nobody else is handed the ids.
  const proofs = new Map(
    isSelf
      ? (
          await db.credit.findMany({
            where: { id: { in: page.map((credit) => credit.id) }, type: 'PROSE' },
            select: { id: true, revisionId: true },
          })
        ).map((credit) => [credit.id, credit.revisionId])
      : [],
  )

  const items = page.map(({ storyboard: { privateSpans, ...storyboard }, ...credit }) => {
    const sent = credit.suggestion?.submittedAt
    // Decision 0007: a contribution sent while its story was private is still
    // credited, but its words stay private to the people who could read them
    // then: before the story was first public, or in a stretch it spent
    // private again (decision 0039). No `publicFrom` on a public story is bad
    // data, and counts as private: hide rather than leak.
    const privateThen =
      !isSelf &&
      sent &&
      writtenWhilePrivate({ publicFrom: storyboard.publicFrom, privateSpans }, sent)
    // Hidden after a report (item 2.7): the credit stays, the words are the
    // writer's alone to see.
    const hiddenWords = !isSelf && Boolean(credit.suggestion?.hiddenAt ?? credit.idea?.hiddenAt)
    const story = `/s/${storyboard.slug}`
    const place = credit.sectionLineage ? places.get(credit.sectionLineage) : undefined
    const where = (() => {
      if (credit.type === 'PROSE') {
        if (place) {
          return {
            path: place.path,
            chapterNumber: place.chapterNumber,
            sectionNumber: place.sectionNumber,
          }
        }
        // Out of the main draft: the suggestion's own page still shows the writing.
        const suggestion = credit.suggestion
        return {
          path: suggestion
            ? `${story}/help/${suggestion.request.publicId}/s/${suggestion.publicId}`
            : story,
          chapterNumber: null,
          sectionNumber: null,
        }
      }
      if (credit.type === 'IDEA' && credit.idea) {
        return {
          path: `${story}/help/${credit.idea.request.publicId}#idea-${credit.ideaId ?? ''}`,
          chapterNumber: null,
          sectionNumber: null,
        }
      }
      return { path: story, chapterNumber: null, sectionNumber: null }
    })()
    const shown = {
      ...credit,
      storyboard,
      where,
      proofRevisionId: proofs.get(credit.id) ?? null,
      suggestion:
        credit.suggestion && hiddenWords
          ? { ...credit.suggestion, contentText: HIDDEN_TEXT }
          : credit.suggestion,
      idea: credit.idea && hiddenWords ? { ...credit.idea, body: HIDDEN_TEXT } : credit.idea,
    }
    return privateThen && shown.suggestion
      ? { ...shown, suggestion: { ...shown.suggestion, contentText: '' } }
      : shown
  })
  return {
    items,
    nextCursor: rows.length > PROFILE_LISTS.credits ? (page[page.length - 1]?.id ?? null) : null,
  }
}

/** FR-9.4 — a page of the suggestions an author passed on, newest decision first. */
async function passedPage(db: PrismaClient, userId: string, cursor: string | null | undefined) {
  const from = cursor
    ? await db.suggestion.findFirst({
        where: { id: cursor, contributorId: userId },
        select: { id: true },
      })
    : null
  const rows = await db.suggestion.findMany({
    where: passedBy(userId),
    orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
    take: PROFILE_LISTS.passed + 1,
    ...(from ? { cursor: { id: from.id }, skip: 1 } : {}),
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
  const items = rows.slice(0, PROFILE_LISTS.passed)
  return {
    items,
    nextCursor: rows.length > PROFILE_LISTS.passed ? (items[items.length - 1]?.id ?? null) : null,
  }
}

const PROFILE_INPUT = z.object({ username: z.string().min(1).max(USERNAME_CHARS.max) })

export const profileRouter = createTRPCRouter({
  byUsername: publicProcedure.input(PROFILE_INPUT).query(async ({ ctx, input }) => {
    const user = await profileUser(ctx.db, input.username)

    const actor = actorFrom(ctx.session, ctx.account)
    const isSelf = actor?.id === user.id
    // Decision 0046 (item 2.9) — for the Block button: may I, and have I.
    const canBlock = actor !== null && !isSelf
    const blockedByMe =
      actor && canBlock
        ? (await ctx.db.userBlock.count({
            where: { blockerId: actor.id, blockedId: user.id },
          })) > 0
        : false

    const theirs = ownCredits(user.id)

    const [authored, credits, spinOffs, proseCount, ideaCount] = await Promise.all([
      ctx.db.storyboard.findMany({
        where: {
          ownerId: user.id,
          ...PUBLICLY_LISTED,
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
          // Item 7b.3 (decision 0044) — its current edition, if it has one.
          publications: { orderBy: { number: 'desc' }, take: 1, select: { number: true } },
          // Item 6.17 — whether anyone else has words in it.
          _count: { select: { credits: { where: { type: { not: 'COAUTHOR' } } } } },
        },
      }),
      creditsPage(ctx.db, user.id, isSelf, null),
      ctx.db.storyboard.count({
        where: {
          ownerId: user.id,
          ...PUBLICLY_LISTED,
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
    // Item 6.17 — how much of each story is the author's own words, where
    // somebody else has words in it.
    const shares = await mainDraftOwnShares(
      ctx.db,
      authored.filter((story) => story._count.credits > 0).map((story) => story.id),
    )

    const showPassed = isSelf || user.showPassedWork
    const none: Awaited<ReturnType<typeof passedPage>> = { items: [], nextCursor: null }
    const [passed, passedCount] = showPassed
      ? await Promise.all([
          passedPage(ctx.db, user.id, null),
          ctx.db.suggestion.count({ where: passedBy(user.id) }),
        ])
      : [none, 0]

    // Item 6.13 — the year ends on the day it is where the reader is.
    const calendar = await activityCalendar(
      ctx.db,
      user.id,
      new Date(),
      timeZoneFromHeaders(ctx.headers),
    )

    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        avatar: user.avatar,
        createdAt: user.createdAt,
        // To the account holder only. Decision 0018 rejected telling anyone
        // else: it publishes an accusation nobody has upheld, on a page with
        // other people's names on it. Every visitor was told until the
        // phase 12 audit.
        suspended: isSelf && user.status === 'SUSPENDED',
      },
      isSelf,
      canBlock,
      blockedByMe,
      /** FR-9.3 — the four counts the profile leads with. */
      counts: {
        authored: authored.length,
        prose: proseCount,
        ideas: ideaCount,
        spinOffs,
      },
      authored: authored.map(({ _count, publications, ...story }) => ({
        ...story,
        ownShare: shares.get(story.id) ?? null,
        edition: publications[0]?.number ?? null,
      })),
      // Item 6.10 — the first page of each; `profile.credits` and
      // `profile.passed` page on from the cursors.
      credits: credits.items,
      creditsCursor: credits.nextCursor,
      passed: passed.items,
      passedCursor: passed.nextCursor,
      passedCount,
      showPassed,
      canTogglePassed: isSelf,
      passedIsPublic: user.showPassedWork,
      calendar,
    }
  }),

  /** Item 6.10 — the next page of someone's credits, from a cursor. */
  credits: publicProcedure
    .input(PROFILE_INPUT.extend({ cursor: z.string().min(1).nullish() }))
    .query(async ({ ctx, input }) => {
      const user = await profileUser(ctx.db, input.username)
      const actor = actorFrom(ctx.session, ctx.account)
      return creditsPage(ctx.db, user.id, actor?.id === user.id, input.cursor)
    }),

  /** FR-9.4, item 6.10 — the next page of passed work: nothing unless the writer shows it, or asks. */
  passed: publicProcedure
    .input(PROFILE_INPUT.extend({ cursor: z.string().min(1).nullish() }))
    .query(async ({ ctx, input }) => {
      const user = await profileUser(ctx.db, input.username)
      const actor = actorFrom(ctx.session, ctx.account)
      if (actor?.id !== user.id && !user.showPassedWork) return { items: [], nextCursor: null }
      return passedPage(ctx.db, user.id, input.cursor)
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
          storyboard: PUBLICLY_LISTED,
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
