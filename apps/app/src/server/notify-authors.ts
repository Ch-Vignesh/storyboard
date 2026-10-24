import 'server-only'

import type { PrismaClient } from '@storyboard/db'

import { withoutThoseWhoBlocked } from '@/server/blocks'

/**
 * In-app rows for the owner and every co-author (FR-12.1): something arrived
 * on a request of theirs. Not for whoever sent it, should that be an author
 * too: being told of your own suggestion is noise.
 *
 * Shared by suggestions and ideas. Ideas told nobody until the 2026-10-16
 * spec review, so "an idea arrived" (FR-12.2) was a type nothing ever sent.
 */
export async function notifyAuthors(
  db: PrismaClient,
  storyboardId: string,
  type: 'SUGGESTION_RECEIVED' | 'SUGGESTION_WITHDRAWN' | 'IDEA_RECEIVED' | 'SPIN_OFF_PUBLISHED',
  payload: Record<string, string>,
  sentBy: string,
  /** Authors already told another way, such as the writer of the idea replied to (item 1.9). */
  alsoSkip: readonly string[] = [],
): Promise<void> {
  const storyboard = await db.storyboard.findUnique({
    where: { id: storyboardId },
    select: {
      ownerId: true,
      collaborators: { where: { acceptedAt: { not: null } }, select: { userId: true } },
    },
  })
  if (!storyboard) return

  // Decision 0046 (item 2.9) — nor anyone who has blocked the sender: the
  // things a blocked person can still do here are taking back what they sent
  // before, and those are not news to the person who blocked them.
  const recipients = await withoutThoseWhoBlocked(
    db,
    [storyboard.ownerId, ...storyboard.collaborators.map((c) => c.userId)].filter(
      (userId) => userId !== sentBy && !alsoSkip.includes(userId),
    ),
    sentBy,
  )
  if (recipients.length === 0) return
  await db.notification.createMany({
    data: recipients.map((userId) => ({ userId, type, payload })),
  })
}
