import type { Prisma, PrismaClient } from '@storyboard/db'

import type { Person } from '@/lib/people'

/**
 * Phase 14, item 5.2 and friends — what closing some requests would mean,
 * before it is done. The same rows `closeRequestsWhere` (`close-requests.ts`)
 * would close and the same people it would tell, counted instead of acted on,
 * so a dialog can say "2 requests close; Maya and Leah will be told" and be
 * right about it.
 */
export type RequestImpact = {
  /** Requests still open, or answered and waiting on a decision. */
  openRequests: number
  /** People with a draft or a waiting suggestion on them, once each. */
  told: Person[]
}

export async function requestImpact(
  db: PrismaClient,
  where: Prisma.ContributionRequestWhereInput,
): Promise<RequestImpact> {
  const open = await db.contributionRequest.findMany({
    where: { ...where, state: { in: ['OPEN', 'ANSWERED'] } },
    select: {
      suggestions: {
        where: { state: { in: ['DRAFT', 'SUBMITTED'] } },
        select: {
          contributor: { select: { id: true, username: true, displayName: true, status: true } },
        },
      },
    },
  })
  const people = new Map<string, Person>()
  for (const request of open) {
    for (const suggestion of request.suggestions) {
      people.set(suggestion.contributor.id, suggestion.contributor)
    }
  }
  return { openRequests: open.length, told: [...people.values()] }
}

/** The whole of a storyboard's open requests: going private, finishing, deleting. */
export function storyboardRequestImpact(db: PrismaClient, storyboardId: string) {
  return requestImpact(db, { storyboardId })
}

/** The requests on some sections: a removal, or a join. */
export function sectionsRequestImpact(db: PrismaClient, sectionIds: readonly string[]) {
  if (sectionIds.length === 0) return Promise.resolve({ openRequests: 0, told: [] })
  return requestImpact(db, { sectionId: { in: [...sectionIds] } })
}
