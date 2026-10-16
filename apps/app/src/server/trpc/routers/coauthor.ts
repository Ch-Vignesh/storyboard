import { Prisma } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { loadStoryboard } from '@/lib/authz/guard'
import { logger } from '@/lib/logger'
import { COAUTHORS_MAX, DAILY_LIMITS, USERNAME_CHARS } from '@/lib/schemas/constants'
import { afterCommit } from '@/server/after-commit'
import { DAY_MS, enforce, key, whenToRetry } from '@/server/limits'

import { activeProcedure, actorFrom, createTRPCRouter, protectedProcedure } from '../init'

const log = logger.child({ router: 'coauthor' })

/**
 * Co-authorship (SRS 3.1 and 3.2, FR-9.1, FR-12.2; architecture section 6's
 * invite, acceptInvite and removeCoauthor).
 *
 * Everything else about a co-author was built: the role in the permission
 * matrix, the quota of ten (decision 0016), the COAUTHOR credit and both
 * notification types. Nothing made one, until the 2026-10-16 spec review,
 * so the whole co-author column of the matrix was unreachable and the
 * private-story copy promised "the people you invite" to nobody.
 *
 * The owner invites; the person invited accepts or declines; the owner can
 * take an invitation back or remove a co-author, and a co-author can leave.
 * Three at most, invitations included (SRS 3.1). Accepting is what makes the
 * credit (FR-9.1); removal does not unmake it, because the writing happened
 * (principle 1.3.3).
 */

/** "@leah" or "Leah", as people type a name they have seen. */
const usernameInput = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/u, '').toLowerCase())
  .pipe(z.string().min(1, 'Type their username.').max(USERNAME_CHARS.max))

const nobody = (username: string) =>
  new TRPCError({ code: 'NOT_FOUND', message: `There is nobody here called @${username}.` })

export const coauthorRouter = createTRPCRouter({
  /** The co-authors and open invitations, for the story's authors. */
  list: protectedProcedure
    .input(z.object({ storyboardId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId, permissions } = await loadStoryboard(
        ctx.db,
        actor,
        { id: input.storyboardId },
        'storyboard:edit',
      )
      const rows = await ctx.db.collaborator.findMany({
        where: { storyboardId },
        orderBy: { invitedAt: 'asc' },
        select: {
          id: true,
          acceptedAt: true,
          invitedAt: true,
          user: { select: { id: true, username: true, displayName: true } },
        },
      })
      return {
        coauthors: rows,
        canInvite: permissions.role === 'owner',
        max: COAUTHORS_MAX,
      }
    }),

  /** SRS 2.2's "invite a co-author". Owner only (SRS 3.2). */
  invite: activeProcedure
    .input(z.object({ storyboardId: z.string().min(1), username: usernameInput }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const { storyboardId, resource } = await loadStoryboard(
        ctx.db,
        actor,
        { id: input.storyboardId },
        'coauthor:invite',
      )
      const ownerId = ctx.session.user.id

      const invitee = await ctx.db.user.findUnique({
        where: { username: input.username },
        select: { id: true, status: true, deletionRequestedAt: true },
      })
      // Somebody suspended, or leaving, is not somebody to write with: the
      // same answer as nobody, which tells a stranger nothing about them.
      if (invitee?.status !== 'ACTIVE' || invitee.deletionRequestedAt) {
        throw nobody(input.username)
      }
      if (invitee.id === resource.ownerId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This is your own story.' })
      }

      const existing = await ctx.db.collaborator.findUnique({
        where: { storyboardId_userId: { storyboardId, userId: invitee.id } },
        select: { acceptedAt: true },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: existing.acceptedAt
            ? `@${input.username} is already a co-author.`
            : `@${input.username} has been invited already.`,
        })
      }

      const taken = await ctx.db.collaborator.count({ where: { storyboardId } })
      if (taken >= COAUTHORS_MAX) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A story has at most ${String(COAUTHORS_MAX)} co-authors, invitations included. Take one back to invite someone else.`,
        })
      }

      await enforce(
        ctx.db,
        key.coauthorInvites(ownerId),
        { limit: DAILY_LIMITS.coauthorInvites, windowMs: DAY_MS },
        (retryAt) => `You have sent a lot of invitations today. Try again ${whenToRetry(retryAt)}.`,
      )

      let invitation: { id: string }
      try {
        invitation = await ctx.db.collaborator.create({
          data: { storyboardId, userId: invitee.id, invitedById: ownerId },
          select: { id: true },
        })
      } catch (error) {
        // The same invitation twice at once: the unique index lets one in.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `@${input.username} has been invited already.`,
          })
        }
        throw error
      }

      // FR-12.2 — "co-author invitation", immediate (FR-12.3).
      await afterCommit('coauthor.invite.notify', () =>
        ctx.db.notification.create({
          data: {
            userId: invitee.id,
            type: 'COAUTHOR_INVITED',
            payload: { storyboardId, invitationId: invitation.id },
          },
        }),
      )
      log.info(
        { event: 'coauthor.invited', storyboardId, invitationId: invitation.id, ownerId },
        'co-author invited',
      )
      return { invitationId: invitation.id }
    }),

  /**
   * The invitations waiting on this person. Their stories' titles are theirs
   * to see now, private or not: the owner chose to show them by inviting.
   */
  invitations: protectedProcedure.query(({ ctx }) =>
    ctx.db.collaborator.findMany({
      where: {
        userId: ctx.session.user.id,
        acceptedAt: null,
        storyboard: { deletedAt: null },
      },
      orderBy: { invitedAt: 'desc' },
      select: {
        id: true,
        invitedAt: true,
        invitedBy: { select: { username: true, displayName: true } },
        storyboard: { select: { title: true, logline: true, visibility: true } },
      },
    }),
  ),

  /** Architecture section 6's acceptInvite. FR-9.1: the credit is made here. */
  accept: activeProcedure
    .input(z.object({ invitationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const invitation = await ctx.db.collaborator.findFirst({
        where: {
          id: input.invitationId,
          userId,
          acceptedAt: null,
          storyboard: { deletedAt: null },
        },
        select: { id: true, storyboardId: true, invitedById: true },
      })
      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'That invitation is no longer open. It may have been taken back.',
        })
      }

      const storyboard = await ctx.db.$transaction(async (tx) => {
        const accepted = await tx.collaborator.updateMany({
          where: { id: invitation.id, acceptedAt: null },
          data: { acceptedAt: new Date() },
        })
        if (accepted.count !== 1) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'That invitation was accepted already.',
          })
        }
        // One co-author credit per person per story, however many times they
        // are invited back.
        const credited = await tx.credit.count({
          where: { storyboardId: invitation.storyboardId, contributorId: userId, type: 'COAUTHOR' },
        })
        if (credited === 0) {
          await tx.credit.create({
            data: {
              storyboardId: invitation.storyboardId,
              contributorId: userId,
              type: 'COAUTHOR',
            },
          })
        }
        return tx.storyboard.findUniqueOrThrow({
          where: { id: invitation.storyboardId },
          select: { slug: true },
        })
      })

      // FR-12.2 — "invitation accepted", to whoever sent it.
      await afterCommit('coauthor.accept.notify', () =>
        ctx.db.notification.create({
          data: {
            userId: invitation.invitedById,
            type: 'COAUTHOR_ACCEPTED',
            payload: { storyboardId: invitation.storyboardId },
          },
        }),
      )
      log.info(
        { event: 'coauthor.accepted', storyboardId: invitation.storyboardId, userId },
        'co-author accepted',
      )
      return { slug: storyboard.slug }
    }),

  /** Saying no. Nobody is told: an invitation that lapses is not news. */
  decline: activeProcedure
    .input(z.object({ invitationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.collaborator.deleteMany({
        where: { id: input.invitationId, userId: ctx.session.user.id, acceptedAt: null },
      })
      return { ok: true }
    }),

  /**
   * Architecture section 6's removeCoauthor: the owner removes a co-author or
   * takes an invitation back, or a co-author leaves. The credit stays: the
   * writing happened (principle 1.3.3).
   */
  remove: activeProcedure
    .input(z.object({ invitationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actor = actorFrom(ctx.session, ctx.account)
      const row = await ctx.db.collaborator.findUnique({
        where: { id: input.invitationId },
        select: { id: true, userId: true, storyboardId: true },
      })
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That co-author is not on this story.' })
      }
      const leaving = row.userId === ctx.session.user.id
      if (!leaving) {
        // Only the owner removes someone else (SRS 3.2's invite row).
        await loadStoryboard(ctx.db, actor, { id: row.storyboardId }, 'coauthor:invite')
      }
      await ctx.db.collaborator.delete({ where: { id: row.id } })
      log.info(
        {
          event: leaving ? 'coauthor.left' : 'coauthor.removed',
          storyboardId: row.storyboardId,
          userId: row.userId,
        },
        leaving ? 'co-author left' : 'co-author removed',
      )
      return { ok: true, left: leaving }
    }),
})
