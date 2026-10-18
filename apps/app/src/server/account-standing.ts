import type { Prisma, PrismaClient, Role } from '@storyboard/db'
import { TRPCError } from '@trpc/server'

import { ACCOUNT_DELETION_GRACE_DAYS } from '@/lib/schemas/constants'

type Db = PrismaClient | Prisma.TransactionClient

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Decision 0043 (phase 14, item 2b.5) — who may be acted on by whom. Nobody
 * suspends, bans or deletes the administrator or themself; a sub-admin cannot
 * act on another sub-admin; an erased account is left as it is (decision
 * 0024). Thrown as the sentence the screen shows.
 */
export function refuseIfUntouchable(
  actor: { id: string; role: Role },
  target: { id: string; role: Role; status: string },
): void {
  if (target.id === actor.id) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not on your own account.' })
  }
  if (target.role === 'ADMIN') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'The administrator cannot be suspended, banned or deleted.',
    })
  }
  if (target.role === 'SUB_ADMIN' && actor.role !== 'ADMIN') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Only the administrator can act on a sub-admin.',
    })
  }
  if (target.status === 'DELETED') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'That account has been deleted.' })
  }
}

/**
 * FR-13.5 — whether ten upheld reports suspend this account. Everyone while
 * active, except the administrator: `canAdmin` would then lock the one person
 * who runs the place out of it (found while building item 2b.3).
 */
export function suspendsForReports(user: { status: string; role: Role } | null): boolean {
  return user?.status === 'ACTIVE' && user.role !== 'ADMIN'
}

/**
 * Reports in one state against one person, across every kind of target.
 *
 * There is no `Report.subjectUserId` column: a report points at the thing, not
 * the person. So this resolves the other way — find everything of theirs that
 * could have been reported, and count reports against those ids. It is a
 * handful of indexed queries and it runs once per decision, not per page.
 */
export async function countReportsAgainst(
  db: Db,
  userId: string,
  state: 'UPHELD' | 'OPEN',
): Promise<number> {
  const [storyboards, suggestions, ideas] = await Promise.all([
    db.storyboard.findMany({ where: { ownerId: userId }, select: { id: true } }),
    db.suggestion.findMany({ where: { contributorId: userId }, select: { id: true } }),
    db.idea.findMany({ where: { authorId: userId }, select: { id: true } }),
  ])

  return db.report.count({
    where: {
      state,
      OR: [
        { targetType: 'USER', targetId: userId },
        { targetType: 'STORYBOARD', targetId: { in: storyboards.map((row) => row.id) } },
        { targetType: 'SUGGESTION', targetId: { in: suggestions.map((row) => row.id) } },
        { targetType: 'IDEA', targetId: { in: ideas.map((row) => row.id) } },
      ],
    },
  })
}

/**
 * An account as the People screen shows it (item 2b.5): standing, role, the
 * note left with the last decision, what they have made, and the reports
 * against them. Grants are for the admin's eyes only (decision 0043).
 */
export async function describeAccount(
  db: Db,
  userId: string,
  viewer: { id: string; seesGrants: boolean },
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      status: true,
      role: true,
      suspendedAt: true,
      suspendedBy: { select: { username: true, displayName: true } },
      bannedAt: true,
      standingNote: true,
      deletionRequestedAt: true,
      createdAt: true,
      lastSeenAt: true,
      adminGrants: { select: { capability: true } },
      _count: { select: { storyboards: true, suggestions: true, ideas: true } },
    },
  })
  if (!user) return null

  const { adminGrants, ...rest } = user
  const [upheld, open] = await Promise.all([
    countReportsAgainst(db, userId, 'UPHELD'),
    countReportsAgainst(db, userId, 'OPEN'),
  ])
  return {
    ...rest,
    grants: viewer.seesGrants ? adminGrants.map((grant) => grant.capability) : null,
    reports: { upheld, open },
    isYou: userId === viewer.id,
    deletionFinishesAt: rest.deletionRequestedAt
      ? new Date(rest.deletionRequestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS)
      : null,
  }
}

export type AccountStanding = NonNullable<Awaited<ReturnType<typeof describeAccount>>>
