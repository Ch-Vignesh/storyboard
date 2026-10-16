import type { Prisma, PrismaClient } from '@storyboard/db'

/**
 * Close every open request on a storyboard, and tell the people answering them.
 *
 * Two things do this — going private (FR-2.7) and marking finished (FR-14.1) —
 * and until now both did the first half only. Closing a request silently is the
 * kind of omission that never shows up in a test and always shows up in
 * somebody's evening: they were part-way through a suggestion, came back, and
 * found the passage gone. Going private is the worse of the two, because a
 * private storyboard answers 404 to everyone who is not an author — so the
 * request, the prose being answered and the context all disappear at once, with
 * nowhere left to ask what happened.
 *
 * **Who is told:** anyone with a suggestion still in flight — a draft they have
 * not sent, or one sent and not yet decided. Not somebody already accepted or
 * passed on: that conversation is over, and FR-6.10 works hard enough to make
 * being passed on survivable without a second message reopening it.
 *
 * In its own module rather than in the router, for the reason `server/tree.ts`
 * is: a rule worth testing should not drag tRPC and Auth.js into the test to
 * reach it.
 *
 * Returns how many requests were closed.
 */
export async function closeOpenRequests(db: PrismaClient, storyboardId: string): Promise<number> {
  // The denormalised column, not a walk up through section → chapter →
  // version. Same rows either way, and this one is the indexed field the
  // schema put there for the purpose.
  return closeRequestsWhere(db, { storyboardId })
}

/**
 * The same for requests on sections that have gone: deleted, joined into the
 * one above, or in a deleted chapter. They stayed open, kept collecting
 * suggestions, and one could be accepted into text that was no longer in the
 * story (phase 12 audit).
 */
export async function closeRequestsOnSections(
  db: PrismaClient,
  sectionIds: readonly string[],
): Promise<number> {
  if (sectionIds.length === 0) return 0
  return closeRequestsWhere(db, { sectionId: { in: [...sectionIds] } })
}

/**
 * One request, closed by its author without accepting (FR-5.10). It used to
 * change the state and tell nobody, so a helper part-way through a draft, or
 * waiting on a decision, never heard (2026-10-16 spec review). True if it was
 * open and is now closed.
 */
export async function closeRequest(db: PrismaClient, requestId: string): Promise<boolean> {
  return (await closeRequestsWhere(db, { id: requestId })) > 0
}

async function closeRequestsWhere(
  db: PrismaClient,
  where: Prisma.ContributionRequestWhereInput,
): Promise<number> {
  const open = await db.contributionRequest.findMany({
    // Answered as well as open: a request with a suggestion waiting is the one
    // whose people most need telling, and it was the one left out until the
    // phase 12 audit (FR-5.9's ANSWERED state).
    where: { ...where, state: { in: ['OPEN', 'ANSWERED'] } },
    select: {
      id: true,
      suggestions: {
        where: { state: { in: ['DRAFT', 'SUBMITTED'] } },
        select: { contributorId: true },
      },
    },
  })
  if (open.length === 0) return 0

  await db.contributionRequest.updateMany({
    where: { id: { in: open.map((request) => request.id) }, state: { in: ['OPEN', 'ANSWERED'] } },
    data: { state: 'CLOSED', closedAt: new Date() },
  })

  // One notification per person per request. Somebody answering two passages on
  // the same storyboard hears about both, because they are two evenings.
  const told = open.flatMap((request) =>
    request.suggestions.map((suggestion) => ({
      userId: suggestion.contributorId,
      type: 'REQUEST_CLOSED' as const,
      payload: { requestId: request.id },
    })),
  )
  if (told.length > 0) await db.notification.createMany({ data: told })

  return open.length
}
