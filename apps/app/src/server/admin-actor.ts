import type { Prisma, PrismaClient } from '@storyboard/db'

import type { AdminActor } from '@/lib/authz/admin'

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Decision 0043 — a sub-admin's grants, read where the account is read: the
 * request context and the admin pages. The admin holds everything and a user
 * nothing, so for them this is no query at all.
 */
export async function grantsOf(db: Db, user: { id: string; role: string }): Promise<string[]> {
  if (user.role !== 'SUB_ADMIN') return []
  const rows = await db.subAdminGrant.findMany({
    where: { userId: user.id },
    select: { capability: true },
  })
  return rows.map((row) => row.capability)
}

/** The account as `canAdmin` wants it, for a page that has a session and no tRPC context. */
export async function loadAdminActor(db: Db, userId: string): Promise<AdminActor> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true, deletionRequestedAt: true },
  })
  if (!row) return null
  return { ...row, grants: await grantsOf(db, { id: userId, role: row.role }) }
}
