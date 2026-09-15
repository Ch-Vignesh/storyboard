import type { PrismaClient } from '@storyboard/db'

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
  const open = await db.contributionRequest.findMany({
    // The denormalised column, not a walk up through section → chapter →
    // version. Same rows either way, and this one is the indexed field the
    // schema put there for the purpose.
    where: { storyboardId, state: 'OPEN' },
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
    where: { id: { in: open.map((request) => request.id) } },
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
