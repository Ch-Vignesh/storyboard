import 'server-only'

import type { PrismaClient } from '@storyboard/db'

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
  type: 'SUGGESTION_RECEIVED' | 'IDEA_RECEIVED',
  payload: Record<string, string>,
  sentBy: string,
): Promise<void> {
  const storyboard = await db.storyboard.findUnique({
    where: { id: storyboardId },
    select: {
      ownerId: true,
      collaborators: { where: { acceptedAt: { not: null } }, select: { userId: true } },
    },
  })
  if (!storyboard) return

  const recipients = [storyboard.ownerId, ...storyboard.collaborators.map((c) => c.userId)].filter(
    (userId) => userId !== sentBy,
  )
  if (recipients.length === 0) return
  await db.notification.createMany({
    data: recipients.map((userId) => ({ userId, type, payload })),
  })
}
