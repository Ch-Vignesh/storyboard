import type { PrismaClient } from '@storyboard/db'

import { PUBLICLY_LISTED } from '@/lib/authz/guard'

/**
 * Phase 14, item 9.8 — the profiles a search engine is told about: somebody
 * with a username, in good standing, who has something anyone may read to
 * their name, a story of their own or a contribution to someone else's.
 *
 * "Anyone may read" is `PUBLICLY_LISTED`, the same filter the profile page
 * lists those stories and credits with, so a profile is never offered for
 * work only its owner can see. A suspended account keeps its profile
 * (decision 0018) but is not offered while it is reviewed; one being deleted
 * has no profile at all (decision 0024).
 */
export async function profilesWithPublicWork(db: PrismaClient, take: number): Promise<string[]> {
  const people = await db.user.findMany({
    where: {
      username: { not: null },
      status: 'ACTIVE',
      deletionRequestedAt: null,
      OR: [
        { storyboards: { some: PUBLICLY_LISTED } },
        // The profile's own rule (`ownCredits`): not the copies a spin-off inherits.
        { credits: { some: { inheritedFromId: null, storyboard: PUBLICLY_LISTED } } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take,
    select: { username: true },
  })
  return people.flatMap((person) => (person.username ? [person.username] : []))
}
