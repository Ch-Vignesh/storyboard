import type { Prisma, PrismaClient } from '@storyboard/db'

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Decision 0046 (phase 14, item 2.9) — the other half of a block: silence.
 * Someone you block can still do a few things that would have told you
 * (take back a suggestion they sent before, spin your story off), and you
 * hear nothing of them. The refusals themselves live in `lib/authz/guard.ts`.
 *
 * No `server-only` guard: the digests' helpers import from here under
 * `pnpm cron`.
 */

/** Of these people, the ones who have not blocked `actorId`. */
export async function withoutThoseWhoBlocked(
  db: Db,
  recipients: readonly string[],
  actorId: string,
): Promise<string[]> {
  if (recipients.length === 0) return []
  const blocks = await db.userBlock.findMany({
    where: { blockedId: actorId, blockerId: { in: [...recipients] } },
    select: { blockerId: true },
  })
  const silent = new Set(blocks.map((block) => block.blockerId))
  return recipients.filter((userId) => !silent.has(userId))
}

export async function hasBlocked(db: Db, blockerId: string, blockedId: string): Promise<boolean> {
  const count = await db.userBlock.count({ where: { blockerId, blockedId } })
  return count > 0
}
