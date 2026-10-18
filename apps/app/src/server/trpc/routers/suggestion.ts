import { Prisma, type PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import {
  assertNotBlocked,
  assertNotFinished,
  loadStoryboard,
  visibleStoryboardsWhere,
} from '@/lib/authz/guard'
import { recordActivity } from '@/server/activity'
import { timeZoneFromHeaders } from '@/lib/time-zone'
import { afterCommit } from '@/server/after-commit'
import { notifyAuthors } from '@/server/notify-authors'
import { canReadSuggestionSentAt, quotaFor } from '@/lib/authz'
import { redactSuggestionText } from '@/server/hidden'
import { emptyDoc, flavourForStoryType, parseDoc } from '@/lib/doc/schema'
import { derive } from '@/lib/doc/text'
import { acceptedDoc } from '@/server/accepted-text'
import { publicId } from '@/lib/ids'
import { logger } from '@/lib/logger'
import { nameOf } from '@/lib/people'
import { AUTHORS_SELECT } from '@/server/answers'
import { DAILY_LIMITS } from '@/lib/schemas/constants'
import { DAY_MS, enforce, key, used, whenToRetry } from '@/server/limits'
import { passChipSchema, suggestionNoteSchema } from '@/lib/schemas/help'

import {
  activeProcedure,
  actorFrom,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '../init'

const log = logger.child({ router: 'suggestion' })

/**
 * Loads a request with everything a suggestion needs to be written against.
 * Anyone who can read the storyboard can reach this; what they may *do* is
 * decided per procedure.
 */
async function loadRequestFor(db: PrismaClient, actor: { id: string } | null, requestId: string) {
  const request = await db.contributionRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      kind: true,
      state: true,
      minWords: true,
      maxWords: true,
      storyboardId: true,
      sectionId: true,
      section: { select: { id: true, currentRevisionId: true } },
      storyboard: { select: { type: true } },
    },
  })
  if (!request) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'That request does not exist.' })
  }
  const storyboard = await loadStoryboard(db, actor, { id: request.storyboardId })
  return { request, storyboard }
}

export const suggestionRouter = createTRPCRouter({
  /**
   * FR-6.1 — a suggestion begins as a private draft, pre-filled with the
   * current section text for a rewrite and empty for a continue. Nothing is
   * visible to anyone until it is sent.
   */
  startDraft: activeProcedure
    .input(
      z.object({
        requestId: z.string().min(1),
        /** Item 5.6 — a suggestion of yours, withdrawn here, to start from. */
        from: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { request, storyboard } = await loadRequestFor(ctx.db, actor, input.requestId)
      // Decision 0046 (item 2.9) — not on a story whose author has blocked you.
      await assertNotBlocked(ctx.db, actor, storyboard.resource)

      if (request.kind === 'UNBLOCK') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This request is asking for ideas, not prose. Post an idea instead.',
        })
      }
      if (!storyboard.permissions.canSubmitSuggestion) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot suggest here.' })
      }
      assertTakingSuggestions(request.state)

      const existing = await ctx.db.suggestion.findFirst({
        where: { requestId: request.id, contributorId: ctx.session.user.id, state: 'DRAFT' },
        select: { id: true, publicId: true },
      })
      if (existing) return existing

      const head = request.section.currentRevisionId
        ? await ctx.db.revision.findUnique({
            where: { id: request.section.currentRevisionId },
            select: { contentJson: true, contentText: true, wordCount: true },
          })
        : null

      if (!request.section.currentRevisionId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That section has no text to write against yet.',
        })
      }

      // Item 5.6 — "Start a new draft from it": the words of a suggestion the
      // same person withdrew on this request, in place of the section's text.
      const seed = input.from
        ? await ctx.db.suggestion.findFirst({
            where: {
              id: input.from,
              requestId: request.id,
              contributorId: ctx.session.user.id,
              state: 'WITHDRAWN',
            },
            select: { contentJson: true, note: true },
          })
        : null
      if (input.from && !seed) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'That is not a suggestion of yours, withdrawn here, to start from.',
        })
      }

      const flavour = flavourForStoryType(request.storyboard.type)
      // FR-6.1 — pre-filled for a rewrite, empty for a continue.
      const content = seed
        ? seed.contentJson
        : request.kind === 'REWRITE' && head
          ? head.contentJson
          : emptyDoc(flavour)
      const derived = derive(parseDoc(content, flavour))

      return ctx.db.suggestion.create({
        data: {
          publicId: publicId(),
          requestId: request.id,
          contributorId: ctx.session.user.id,
          // FR-6.3 — the staleness anchor.
          baseRevisionId: request.section.currentRevisionId,
          contentJson: content ?? {},
          contentText: derived.contentText,
          wordCount: derived.wordCount,
          note: seed?.note ?? null,
          state: 'DRAFT',
        },
        select: { id: true, publicId: true },
      })
    }),

  /**
   * Phase 14, items 6.3 and 6.4 (FR-13.2, FR-13.3) — what a person may still
   * send on a story, before they write: how many of their suggestions are
   * waiting on it against their quota (decision 0016's tiers), and how many
   * sends the day has left. The same counts `submit` enforces, read ahead of
   * time; `submit` still decides.
   */
  allowance: protectedProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId, resource } = await loadStoryboard(ctx.db, actor, {
        id: input.storyboardId,
      })
      const userId = ctx.session.user.id
      const quota = quotaFor(actor, resource)
      const [waiting, sentToday] = await Promise.all([
        ctx.db.suggestion.count({
          where: {
            contributorId: userId,
            state: 'SUBMITTED',
            hiddenAt: null,
            request: { storyboardId, state: { in: ['OPEN', 'ANSWERED'] } },
          },
        }),
        used(ctx.db, key.suggestionsSent(userId), DAY_MS),
      ])
      return {
        quota: Number.isFinite(quota) ? quota : null,
        waiting,
        sendsLeftToday: Math.max(0, DAILY_LIMITS.suggestionsSent - sentToday),
      }
    }),

  /**
   * Item 6.5 (FR-6.1) — a draft thrown away by its writer. Only a DRAFT, and
   * only their own; anything sent is withdrawn instead, which tells the
   * author. Nothing refers to a draft, so the row simply goes.
   */
  discardDraft: activeProcedure
    .input(z.object({ suggestionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.suggestion.deleteMany({
        where: { id: input.suggestionId, contributorId: ctx.session.user.id, state: 'DRAFT' },
      })
      if (count === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'That is not a draft of yours. A sent suggestion is withdrawn, not thrown away.',
        })
      }
      log.info({ event: 'suggestion.discard', suggestionId: input.suggestionId }, 'draft discarded')
      return { removed: true }
    }),

  /** Autosave for the composer. A draft is private to its author (FR-6.1). */
  saveDraft: activeProcedure
    .input(
      z.object({
        suggestionId: z.string().min(1),
        contentJson: z.unknown(),
        /** FR-6.2 — saved with the draft, so leaving keeps it (item 1.11). */
        note: suggestionNoteSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const suggestion = await requireOwnDraft(ctx, input.suggestionId)
      const storyType = await ctx.db.storyboard.findUniqueOrThrow({
        where: { id: suggestion.request.storyboardId },
        select: { type: true },
      })
      const doc = parseDoc(input.contentJson, flavourForStoryType(storyType.type))
      const derived = derive(doc)

      return ctx.db.suggestion.update({
        where: { id: suggestion.id },
        data: {
          contentJson: doc,
          contentText: derived.contentText,
          wordCount: derived.wordCount,
          // Left out of the input, the note stands; emptied, it goes.
          ...(input.note !== undefined ? { note: input.note || null } : {}),
        },
        select: { id: true, wordCount: true },
      })
    }),

  /**
   * FR-6.2 — sending. The quota (FR-13.2) is counted inside the same
   * transaction as the state change, because two tabs submitting at once would
   * both pass a check made outside one.
   */
  submit: activeProcedure
    .input(
      z.object({
        suggestionId: z.string().min(1),
        note: suggestionNoteSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const suggestion = await requireOwnDraft(ctx, input.suggestionId)
      const { request } = suggestion
      const userId = ctx.session.user.id
      // FR-6.7 — a stale suggestion, updated and sent again. It was counted
      // when it was first sent, so it is not counted again, and it may go to a
      // request that has been answered since: an author may accept a second
      // suggestion after a first (FR-6.8), and only an accept makes one stale.
      const resend = suggestion.submittedAt !== null
      assertTakingSuggestions(request.state, resend)

      // FR-13.1 — word bounds, enforced server-side as well as in the composer.
      if (suggestion.wordCount < request.minWords || suggestion.wordCount > request.maxWords) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `This request asks for between ${String(request.minWords)} and ${String(request.maxWords)} words. Yours is ${String(suggestion.wordCount)}.`,
        })
      }

      const actor = actorFrom(ctx.session, ctx.account)
      const storyboard = await loadStoryboard(ctx.db, actor, { id: request.storyboardId })
      // A re-send may go to a resolved request, which finishing a story does
      // not close; it must not reopen one on a finished story.
      assertNotFinished(storyboard.resource, 'by a helper')
      // Decision 0046 (item 2.9) — nor sent, nor re-sent, by someone an author blocked.
      await assertNotBlocked(ctx.db, actor, storyboard.resource)
      // FR-13.2 with OD-6 resolved (decision 0016): three tiers, not an
      // exemption. The owner has no ceiling on their own storyboard; a
      // co-author has a generous one, because the quota protects the owner's
      // attention and a co-author is trusted with it, not exempt from it.
      const quota = resend ? Number.POSITIVE_INFINITY : quotaFor(actor, storyboard.resource)
      const overQuota = () =>
        new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `You can have ${String(quota)} suggestions waiting on this story at once. Wait for a decision on one, or withdraw it.`,
        })
      // Waiting on a request that is still open. One the author closed
      // without accepting is not waiting on anyone (FR-5.10), and held its
      // writer's place here for good until the 2026-10-16 spec review.
      const held = (db: Pick<PrismaClient, 'suggestion'>) =>
        db.suggestion.count({
          where: {
            contributorId: userId,
            state: 'SUBMITTED',
            // Hidden after a report (item 2.7): holds no place.
            hiddenAt: null,
            request: { storyboardId: request.storyboardId, state: { in: ['OPEN', 'ANSWERED'] } },
          },
        })

      // Checked before the daily limit is spent, not after: a refusal here
      // used to cost one of the day's ten sends, so clicking Send a few times
      // on a story where three were already waiting locked somebody out of
      // every story for a day (phase 12 audit). Checked again below, under a
      // lock, because this read alone can race.
      if (Number.isFinite(quota) && (await held(ctx.db)) >= quota) throw overQuota()

      // FR-13.3 — ten in any twenty-four hours, not ten since midnight. A
      // re-send was counted the first time.
      if (!resend) {
        await enforce(
          ctx.db,
          key.suggestionsSent(userId),
          { limit: DAILY_LIMITS.suggestionsSent, windowMs: DAY_MS },
          (retryAt) =>
            `You can send ${String(DAILY_LIMITS.suggestionsSent)} suggestions a day. Try again ${whenToRetry(retryAt)}.`,
        )
      }

      const result = await ctx.db.$transaction(async (tx) => {
        if (Number.isFinite(quota)) {
          // One person's sends to one story, one at a time. A count inside a
          // transaction is not enough by itself: at READ COMMITTED, five
          // submissions at once all counted none held and all went through
          // against a cap of three (phase 12 audit).
          const lock = `suggestion-quota:${userId}:${request.storyboardId}`
          await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`
          if ((await held(tx)) >= quota) throw overQuota()
        }

        // Still a draft, still this person's: a second tab may have sent it.
        const sent = await tx.suggestion.updateMany({
          where: { id: suggestion.id, state: 'DRAFT' },
          data: {
            state: 'SUBMITTED',
            submittedAt: new Date(),
            // A send that leaves the note out keeps the one saved with the
            // draft: a stale suggestion updated and sent again used to lose
            // it (item 1.11).
            ...(input.note !== undefined ? { note: input.note || null } : {}),
          },
        })
        if (sent.count !== 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'That suggestion has already been sent.',
          })
        }
        const updated = await tx.suggestion.findUniqueOrThrow({
          where: { id: suggestion.id },
          select: { id: true, publicId: true, state: true },
        })

        // FR-5.9 — a request with an undecided suggestion is `answered`.
        await tx.contributionRequest.updateMany({
          where: { id: request.id, state: 'OPEN' },
          data: { state: 'ANSWERED' },
        })

        return updated
      })

      await afterCommit('suggestion.submit.notify', () =>
        notifyAuthors(
          ctx.db,
          request.storyboardId,
          'SUGGESTION_RECEIVED',
          { requestId: request.id, suggestionId: suggestion.id },
          userId,
        ),
      )
      // FR-9.3 with D-6 (item 6.13) — help given marks the calendar: a send,
      // on somebody else's story, on the day it is where the sender is.
      if (storyboard.permissions.role !== 'owner' && storyboard.permissions.role !== 'coauthor') {
        await recordActivity(ctx.db, userId, new Date(), timeZoneFromHeaders(ctx.headers))
      }

      log.info(
        { event: 'suggestion.submit', suggestionId: suggestion.id, requestId: request.id, userId },
        'suggestion sent',
      )
      return result
    }),

  /**
   * Phase 14, item 6.7 (D-12) — a sent suggestion changed by its writer,
   * until an author opens it. One conditional write: the row must still be
   * SUBMITTED and unopened at the moment it is written, so a read that saw it
   * unopened a moment before an author opened it changes nothing. It costs
   * neither the quota (nothing new waits) nor the day's sends. The comparison
   * is computed on request and cached nowhere, so nothing is to clear.
   */
  edit: activeProcedure
    .input(
      z.object({
        suggestionId: z.string().min(1),
        contentJson: z.unknown(),
        note: suggestionNoteSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const suggestion = await ctx.db.suggestion.findFirst({
        where: { id: input.suggestionId, contributorId: userId },
        select: {
          state: true,
          openedAt: true,
          request: {
            select: {
              minWords: true,
              maxWords: true,
              storyboardId: true,
              storyboard: { select: { type: true } },
            },
          },
        },
      })
      if (!suggestion) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'That suggestion is not yours to change.',
        })
      }
      const cannotChangeNow = () =>
        new TRPCError({
          code: 'CONFLICT',
          message:
            "The author has started reading it, so it can't change now. Withdraw it and send a new one.",
        })
      if (suggestion.state !== 'SUBMITTED' || suggestion.openedAt) throw cannotChangeNow()

      const flavour = flavourForStoryType(suggestion.request.storyboard.type)
      const doc = parseDoc(input.contentJson, flavour)
      const derived = derive(doc)
      if (
        derived.wordCount < suggestion.request.minWords ||
        derived.wordCount > suggestion.request.maxWords
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `This request asks for between ${String(suggestion.request.minWords)} and ${String(suggestion.request.maxWords)} words. Yours is ${String(derived.wordCount)}.`,
        })
      }

      const now = new Date()
      const { count } = await ctx.db.suggestion.updateMany({
        where: {
          id: input.suggestionId,
          contributorId: userId,
          state: 'SUBMITTED',
          openedAt: null,
        },
        data: {
          contentJson: doc,
          contentText: derived.contentText,
          wordCount: derived.wordCount,
          note: input.note ?? null,
          editedAt: now,
        },
      })
      // Opened between the read above and this write: the same answer.
      if (count === 0) throw cannotChangeNow()
      log.info(
        { event: 'suggestion.edit', suggestionId: input.suggestionId },
        'sent suggestion changed',
      )
      return { editedAt: now }
    }),

  /** FR-6.5 — withdraw before a decision. Frees a quota slot. */
  withdraw: activeProcedure
    .input(z.object({ suggestionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const suggestion = await ctx.db.suggestion.findUnique({
        where: { id: input.suggestionId },
        select: {
          id: true,
          contributorId: true,
          state: true,
          requestId: true,
          openedAt: true,
          request: { select: { storyboardId: true } },
        },
      })
      if (suggestion?.contributorId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }
      const stillWaitingOnly = () =>
        new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only a suggestion that is still waiting can be withdrawn.',
        })
      if (suggestion.state !== 'SUBMITTED' && suggestion.state !== 'STALE') throw stillWaitingOnly()

      // Only if it is still waiting at the moment of writing: an author may be
      // deciding on it right now (phase 12 audit).
      const withdrawn = await ctx.db.suggestion.updateMany({
        where: { id: suggestion.id, state: { in: ['SUBMITTED', 'STALE'] } },
        // `withdrawnAt` existed from the start and nothing wrote it (item 1.10).
        data: { state: 'WITHDRAWN', withdrawnAt: new Date() },
      })
      if (withdrawn.count !== 1) throw stillWaitingOnly()
      // FR-5.9 — the last one waiting is gone, so the request is open again.
      // `pass` did this; `withdraw` did not (phase 12 audit).
      await reopenIfNothingWaits(ctx.db, suggestion.requestId)

      // FR-6.5 — the authors hear of it only if one of them had opened it;
      // one they never looked at was never waiting on them (item 1.10).
      if (suggestion.openedAt) {
        await afterCommit('suggestion.withdraw.notify', () =>
          notifyAuthors(
            ctx.db,
            suggestion.request.storyboardId,
            'SUGGESTION_WITHDRAWN',
            { suggestionId: suggestion.id, requestId: suggestion.requestId },
            userId,
          ),
        )
      }

      log.info({ event: 'suggestion.withdraw', suggestionId: suggestion.id, userId }, 'withdrawn')
      return { id: suggestion.id, state: 'WITHDRAWN' as const }
    }),

  /** One suggestion, with its prose. Public so a passed one stays readable (FR-6.11). */
  get: publicProcedure
    .input(z.object({ publicId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const suggestion = await ctx.db.suggestion.findUnique({
        where: { publicId: input.publicId },
        select: {
          id: true,
          publicId: true,
          state: true,
          note: true,
          wordCount: true,
          contentJson: true,
          contentText: true,
          passReason: true,
          submittedAt: true,
          decidedAt: true,
          baseRevisionId: true,
          hiddenAt: true,
          // Item 6.7 — whether it may still be changed, and whether it was.
          openedAt: true,
          editedAt: true,
          contributor: { select: { id: true, username: true, displayName: true } },
          decidedBy: { select: { id: true, username: true, displayName: true } },
          request: {
            select: {
              id: true,
              publicId: true,
              title: true,
              kind: true,
              state: true,
              minWords: true,
              maxWords: true,
              storyboardId: true,
              sectionId: true,
              section: { select: { id: true, currentRevisionId: true, title: true } },
              storyboard: { select: { slug: true, title: true, type: true } },
            },
          },
        },
      })
      if (!suggestion) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }

      const actor = actorFrom(ctx.session, ctx.account)
      const { permissions, resource } = await loadStoryboard(ctx.db, actor, {
        id: suggestion.request.storyboardId,
      })
      // Decision 0007: sent while the story was private, it stays private.
      if (!canReadSuggestionSentAt(actor, resource, suggestion.submittedAt)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }

      // A draft is nobody's business but its author's.
      if (suggestion.state === 'DRAFT' && suggestion.contributor.id !== actor?.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }

      // FR-6.5 (phase 14, item 1.10) — the first time an author opens it, and
      // only once. A withdrawal tells the authors only if this is set, and
      // item 6.7 lets a helper change a suggestion only until it is.
      if (
        permissions.canOpenRequest &&
        (suggestion.state === 'SUBMITTED' || suggestion.state === 'STALE')
      ) {
        await ctx.db.suggestion.updateMany({
          where: { id: suggestion.id, openedAt: null },
          data: { openedAt: new Date() },
        })
      }

      const isStale =
        suggestion.state === 'SUBMITTED' &&
        suggestion.request.section.currentRevisionId !== suggestion.baseRevisionId

      // Hidden after a report (item 2.7): its text reads as removed to
      // everyone but its writer and a moderator.
      return { suggestion: redactSuggestionText(suggestion, actor), permissions, isStale }
    }),

  /**
   * FR-6.6, FR-6.7 and FR-8.1 — the only place in the product where
   * concurrency genuinely matters, implemented exactly as architecture
   * section 6.1 specifies.
   *
   * One serialisable transaction: lock the section row, refuse if the head has
   * moved since the suggestion was written, write the new revision with the
   * *contributor* as author and the deciding author as acceptor, mark every
   * other waiting suggestion stale, create the credit, resolve the request.
   *
   * Notifications go after the transaction, never inside it.
   */
  accept: activeProcedure
    .input(
      z.object({
        suggestionId: z.string().min(1),
        /**
         * FR-6.6 — the head the author was looking at when they decided, so
         * "accept anyway" covers the change they saw and no later one. It was
         * a plain yes, which also waved through a change made a second ago by
         * somebody else (2026-10-16 spec review).
         */
        acknowledgedHeadId: z.string().min(1).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const suggestion = await ctx.db.suggestion.findUnique({
        where: { id: input.suggestionId },
        select: {
          id: true,
          state: true,
          contributorId: true,
          baseRevisionId: true,
          contentJson: true,
          contentText: true,
          wordCount: true,
          hiddenAt: true,
          request: {
            select: {
              id: true,
              storyboardId: true,
              sectionId: true,
              state: true,
              kind: true,
              section: { select: { lineageId: true } },
              storyboard: { select: { type: true, ...AUTHORS_SELECT } },
            },
          },
        },
      })
      if (!suggestion) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }
      await loadStoryboard(
        ctx.db,
        actor,
        { id: suggestion.request.storyboardId },
        'suggestion:decide',
      )
      // Hidden after a report (item 2.7, decision 0045): not an answer, never
      // accepted. After the authz check, so a stranger learns nothing.
      if (suggestion.hiddenAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This suggestion was removed after a report, so it cannot be accepted.',
        })
      }
      const flavour = flavourForStoryType(suggestion.request.storyboard.type)

      if (suggestion.state !== 'SUBMITTED' && suggestion.state !== 'STALE') {
        throw await decisionRefusal(ctx.db, suggestion.id)
      }
      // Closed by the author, or by the story going private or finished: what
      // was waiting there is not to be let in (phase 12 audit).
      if (suggestion.request.state === 'CLOSED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That request is closed. Open it again before accepting anything into it.',
        })
      }

      const deciderId = ctx.session.user.id
      const { sectionId, id: requestId } = suggestion.request
      // Item 1.7, decision 0041 — an owner or co-author at this moment is an
      // author of the story, and earns no credit for help with their own work.
      const contributorIsAuthor =
        suggestion.contributorId === suggestion.request.storyboard.ownerId ||
        suggestion.request.storyboard.collaborators.some(
          (collaborator) => collaborator.userId === suggestion.contributorId,
        )

      const accepted = await serialisedOrChanged(() =>
        ctx.db.$transaction(
          async (tx) => {
            // Row lock: two acceptances on the same section serialise here rather
            // than both writing a revision.
            const locked = await tx.$queryRaw<
              Array<{ currentRevisionId: string | null; gone: boolean }>
            >`
            select "currentRevisionId", ("deletedAt" is not null or "mergedIntoId" is not null) as gone
            from "Section" where id = ${sectionId} for update
          `
            // Accepted into a section that is no longer in the story, it was
            // credited and announced as accepted and appeared nowhere (phase 12 audit).
            if (locked[0]?.gone) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                  'That section is no longer in this story, so nothing can be accepted into it.',
              })
            }
            const head = locked[0]?.currentRevisionId ?? null

            if (head !== suggestion.baseRevisionId && input.acknowledgedHeadId !== head) {
              throw changedAMomentAgo()
            }

            // FR-8.1 and decision 0038: a rewrite becomes the section's text; a
            // continuation goes after the text it was written to follow, which
            // is the head unless the section moved since. If it moved, FR-6.8:
            // what the helper wrote against is what goes in, and a second
            // continuation replaces the first rather than stacking after it.
            const baseDoc =
              suggestion.request.kind === 'CONTINUE'
                ? ((
                    await tx.revision.findUnique({
                      where: { id: suggestion.baseRevisionId },
                      select: { contentJson: true },
                    })
                  )?.contentJson ?? null)
                : null
            const doc = acceptedDoc(
              suggestion.request.kind,
              baseDoc,
              suggestion.contentJson,
              flavour,
            )
            const derived = derive(doc)

            const revision = await tx.revision.create({
              data: {
                sectionId,
                parentId: head,
                contentJson: doc,
                contentText: derived.contentText,
                wordCount: derived.wordCount,
                contentHash: derived.contentHash,
                source: 'ACCEPTED',
                // FR-8.1 — the contributor wrote the words; the author let them in.
                authorId: suggestion.contributorId,
                acceptedById: deciderId,
                suggestionId: suggestion.id,
              },
              select: { id: true },
            })

            await tx.section.update({
              where: { id: sectionId },
              data: { currentRevisionId: revision.id, wordCount: derived.wordCount },
            })

            // Only if nobody decided it, or withdrew it, since it was read above.
            const decided = await tx.suggestion.updateMany({
              where: { id: suggestion.id, state: { in: ['SUBMITTED', 'STALE'] } },
              data: { state: 'ACCEPTED', decidedAt: new Date(), decidedById: deciderId },
            })
            if (decided.count !== 1) throw await decisionRefusal(tx, suggestion.id)

            // FR-6.7 — everything else waiting on this request is now written
            // against a head that has moved.
            await tx.suggestion.updateMany({
              where: { requestId, state: 'SUBMITTED', id: { not: suggestion.id } },
              data: { state: 'STALE' },
            })

            // FR-9.1 — permanent, and it survives the text being replaced
            // later. Not for the story's own authors (item 1.7): a credit says
            // somebody else helped, and the revision already names them.
            if (!contributorIsAuthor) {
              await tx.credit.create({
                data: {
                  storyboardId: suggestion.request.storyboardId,
                  contributorId: suggestion.contributorId,
                  type: 'PROSE',
                  sectionLineage: suggestion.request.section.lineageId,
                  revisionId: revision.id,
                  suggestionId: suggestion.id,
                  isLive: true,
                },
              })
            }

            await tx.contributionRequest.update({
              where: { id: requestId },
              data: { state: 'RESOLVED', resolvedAt: new Date() },
            })

            return { revisionId: revision.id }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      )

      // After the transaction, never inside it.
      await afterCommit('suggestion.accept.notify', async () => {
        const staled = await ctx.db.suggestion.findMany({
          where: { requestId, state: 'STALE' },
          select: { id: true, contributorId: true },
        })
        await ctx.db.notification.createMany({
          data: [
            {
              userId: suggestion.contributorId,
              type: 'SUGGESTION_ACCEPTED' as const,
              payload: { suggestionId: suggestion.id, requestId },
            },
            ...staled.map((entry) => ({
              userId: entry.contributorId,
              type: 'SUGGESTION_STALE' as const,
              payload: { suggestionId: entry.id, requestId },
            })),
          ],
        })
      })

      log.info(
        {
          event: 'suggestion.accepted',
          suggestionId: suggestion.id,
          requestId,
          contributorId: suggestion.contributorId,
          deciderId,
          revisionId: accepted.revisionId,
        },
        'suggestion accepted',
      )
      return accepted
    }),

  /**
   * FR-6.10 — passing needs no written reason. An optional chip from a fixed
   * set, chosen in one click, and no free-text field anywhere.
   */
  pass: activeProcedure
    .input(
      z.object({
        suggestionId: z.string().min(1),
        reason: passChipSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const suggestion = await ctx.db.suggestion.findUnique({
        where: { id: input.suggestionId },
        select: {
          id: true,
          state: true,
          contributorId: true,
          request: { select: { id: true, storyboardId: true } },
        },
      })
      if (!suggestion) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }
      await loadStoryboard(
        ctx.db,
        actor,
        { id: suggestion.request.storyboardId },
        'suggestion:decide',
      )
      if (suggestion.state !== 'SUBMITTED' && suggestion.state !== 'STALE') {
        throw await decisionRefusal(ctx.db, suggestion.id)
      }

      // Only if it is still undecided at the moment of writing. A co-author
      // passing while the owner accepted used to leave it PASSED with its text
      // in the manuscript and a live credit (phase 12 audit).
      const passed = await ctx.db.suggestion.updateMany({
        where: { id: suggestion.id, state: { in: ['SUBMITTED', 'STALE'] } },
        data: {
          state: 'PASSED',
          passReason: input.reason ?? null,
          decidedAt: new Date(),
          decidedById: ctx.session.user.id,
        },
      })
      if (passed.count !== 1) throw await decisionRefusal(ctx.db, suggestion.id)
      const updated = {
        id: suggestion.id,
        state: 'PASSED' as const,
        passReason: input.reason ?? null,
      }

      // FR-5.9 — if nothing is waiting any more, the request is open again.
      await reopenIfNothingWaits(ctx.db, suggestion.request.id)

      // FR-6.10 — information, not a verdict. The wording lives in the template.
      await afterCommit('suggestion.pass.notify', () =>
        ctx.db.notification.create({
          data: {
            userId: suggestion.contributorId,
            type: 'SUGGESTION_PASSED',
            payload: { suggestionId: suggestion.id, requestId: suggestion.request.id },
          },
        }),
      )

      log.info(
        { event: 'suggestion.passed', suggestionId: suggestion.id, reason: input.reason ?? null },
        'suggestion passed',
      )
      return updated
    }),

  /**
   * FR-6.7 — a stale suggestion can be revised against the new text and sent
   * again without consuming additional quota. Re-anchoring is the whole of it:
   * the suggestion goes back to being a draft, pointed at the current head.
   */
  rebase: activeProcedure
    .input(z.object({ suggestionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const suggestion = await ctx.db.suggestion.findUnique({
        where: { id: input.suggestionId },
        select: {
          id: true,
          state: true,
          contributorId: true,
          request: { select: { section: { select: { currentRevisionId: true } } } },
        },
      })
      if (suggestion?.contributorId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
      }
      // Item 6.6 — a draft started against text that has moved on may move
      // its base too; its words are left as they are, which the composer says.
      if (suggestion.state !== 'STALE' && suggestion.state !== 'DRAFT') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That suggestion is already up to date.',
        })
      }

      const head = suggestion.request.section.currentRevisionId
      if (!head) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That section has no text.' })
      }

      const updated = await ctx.db.suggestion.update({
        where: { id: suggestion.id },
        // `submittedAt` is kept: it is the record that this was sent once,
        // which is what lets it be sent again to a request that has since been
        // answered, without spending quota (FR-6.7). Clearing it stranded every
        // updated suggestion (2026-10-16 spec review).
        data: { state: 'DRAFT', baseRevisionId: head },
        select: { id: true, publicId: true, state: true, baseRevisionId: true },
      })
      log.info({ event: 'suggestion.rebase', suggestionId: suggestion.id, userId }, 'rebased')
      return updated
    }),

  /** Everything this person has written, for their profile (FR-6.11, FR-9.4). */
  /**
   * Everything of yours, drafts included (item 6.5): the page splits them
   * into what is not sent yet, what needs updating and what was sent.
   */
  listMine: protectedProcedure.query(({ ctx }) =>
    ctx.db.suggestion.findMany({
      where: {
        contributorId: ctx.session.user.id,
        // Only stories they can still see. A story made private, renamed or
        // deleted since went on showing its title and address here (phase 12
        // audit).
        request: { storyboard: visibleStoryboardsWhere(actorFrom(ctx.session, ctx.account)) },
      },
      orderBy: [{ submittedAt: { sort: 'desc', nulls: 'first' } }, { updatedAt: 'desc' }],
      select: {
        id: true,
        publicId: true,
        state: true,
        wordCount: true,
        submittedAt: true,
        updatedAt: true,
        editedAt: true,
        passReason: true,
        request: {
          select: {
            title: true,
            publicId: true,
            // So a suggestion on a request closed without accepting reads
            // "not accepted" (FR-5.10).
            state: true,
            storyboard: { select: { slug: true, title: true } },
          },
        },
      },
    }),
  ),
})

/** FR-6.6's sentence, for every way two decisions on one section can collide. */
const changedAMomentAgo = () =>
  new TRPCError({
    code: 'CONFLICT',
    message: 'This section changed a moment ago. Look at it again before deciding.',
  })

/**
 * Two accepts on one section: the second waits on the row lock, and at
 * SERIALIZABLE it then fails with a serialization error once the first
 * commits. That is FR-6.6's case exactly, and it reached the author as a
 * server fault until the 2026-10-16 spec review.
 */
async function serialisedOrChanged<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw changedAMomentAgo()
    }
    throw error
  }
}

const alreadyDecided = () =>
  new TRPCError({ code: 'BAD_REQUEST', message: 'That suggestion has already been decided.' })

/**
 * Why a decision is refused: the helper withdrew it a moment ago, named
 * (FR-6.5, phase 14 item 1.10), or somebody else decided it first.
 */
async function decisionRefusal(
  db: Pick<PrismaClient, 'suggestion'>,
  suggestionId: string,
): Promise<TRPCError> {
  const row = await db.suggestion.findUnique({
    where: { id: suggestionId },
    select: { state: true, contributor: { select: { username: true, displayName: true } } },
  })
  if (row?.state === 'WITHDRAWN') {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: `${nameOf(row.contributor)} withdrew this a moment ago.`,
    })
  }
  return alreadyDecided()
}

/**
 * FR-5.9 — a request takes suggestions while it is open or answered. Closed
 * (by its author, or by the story going private or finished) and resolved
 * ones do not; until the phase 12 audit nothing here checked, so a closed
 * request kept collecting suggestions, notifications and quota.
 */
function assertTakingSuggestions(state: string, resend = false): void {
  if (state === 'OPEN' || state === 'ANSWERED') return
  // FR-6.7 with FR-6.8: an answered request still takes back what was sent to
  // it before the answer, updated against the new text. Refusing it stranded
  // every updated stale suggestion (2026-10-16 spec review).
  if (state === 'RESOLVED' && resend) return
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message:
      state === 'RESOLVED'
        ? 'That request has already been answered.'
        : 'That request is closed, so it is not taking suggestions.',
  })
}

/** FR-5.9 — with nothing waiting on it, an answered request is open again. */
async function reopenIfNothingWaits(db: PrismaClient, requestId: string): Promise<void> {
  const stillWaiting = await db.suggestion.count({
    where: { requestId, state: { in: ['SUBMITTED', 'STALE'] } },
  })
  if (stillWaiting === 0) {
    await db.contributionRequest.updateMany({
      where: { id: requestId, state: 'ANSWERED' },
      data: { state: 'OPEN' },
    })
  }
}

/** A draft the signed-in user owns, with its request. */
async function requireOwnDraft(
  ctx: { db: PrismaClient; session: { user: { id: string } } },
  suggestionId: string,
) {
  const suggestion = await ctx.db.suggestion.findUnique({
    where: { id: suggestionId },
    select: {
      id: true,
      contributorId: true,
      state: true,
      wordCount: true,
      submittedAt: true,
      request: {
        select: { id: true, storyboardId: true, minWords: true, maxWords: true, state: true },
      },
    },
  })
  if (suggestion?.contributorId !== ctx.session.user.id) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'That suggestion does not exist.' })
  }
  if (suggestion.state !== 'DRAFT') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'That suggestion has already been sent.',
    })
  }
  return suggestion
}
