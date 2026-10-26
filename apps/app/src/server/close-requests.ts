import type { Prisma, PrismaClient } from '@storyboard/db'

import { REQUEST_OPEN_DAYS } from '@/lib/schemas/constants'

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
  return (await closeRequestsWhere(db, { storyboardId })).length
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
  return (await closeRequestsWhere(db, { sectionId: { in: [...sectionIds] } })).length
}

/**
 * One request, closed by its author without accepting (FR-5.10). It used to
 * change the state and tell nobody, so a helper part-way through a draft, or
 * waiting on a decision, never heard (2026-10-16 spec review). True if it was
 * open and is now closed.
 */
export async function closeRequest(
  db: PrismaClient,
  requestId: string,
  /** Item 6.9 — the author closing it, for the row to name. */
  closedById?: string,
): Promise<boolean> {
  return (await closeRequestsWhere(db, { id: requestId }, { byId: closedById })).length > 0
}

/**
 * FR-11.3 with D-8 (phase 14, item 6.15; decision 0050) — the nightly close.
 * Every request still open or answered `REQUEST_OPEN_DAYS` after it was
 * opened, or last opened again, closes as the author's own close would, with
 * the people answering it told the same way; and the author is told once per
 * request, so they can open it again if they still want help. A resolved
 * request is left alone: it has had its answer. Returns how many closed.
 */
export async function closeStaleRequests(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - REQUEST_OPEN_DAYS * 24 * 60 * 60 * 1000)
  const stale = await db.contributionRequest.findMany({
    where: {
      state: { in: ['OPEN', 'ANSWERED'] },
      openedAt: { lt: cutoff },
      storyboard: { deletedAt: null },
    },
    select: { id: true, openedById: true, openedAt: true },
  })
  if (stale.length === 0) return 0

  const closed = new Set(
    await closeRequestsWhere(
      db,
      { id: { in: stale.map((request) => request.id) } },
      { afterDays: REQUEST_OPEN_DAYS },
    ),
  )
  // Once per close: a row since it was last opened means another run told
  // them. Not once per request for ever: opened again and closing by itself a
  // second time, it told its author nothing (2026-10-24 final pass).
  for (const request of stale) {
    if (!closed.has(request.id)) continue
    const told = await db.notification.findFirst({
      where: {
        userId: request.openedById,
        type: 'REQUEST_AUTO_CLOSED',
        payload: { path: ['requestId'], equals: request.id },
        createdAt: { gte: request.openedAt },
      },
      select: { id: true },
    })
    if (told) continue
    await db.notification.create({
      data: {
        userId: request.openedById,
        type: 'REQUEST_AUTO_CLOSED',
        payload: { requestId: request.id, after: REQUEST_OPEN_DAYS },
      },
    })
  }
  return closed.size
}

/**
 * Closes what the `where` names and is still open or answered; returns the
 * ids it closed. `byId` is the author who closed it; `afterDays` marks the
 * nightly close, so helpers are not told an author closed it (item 6.15).
 */
async function closeRequestsWhere(
  db: PrismaClient,
  where: Prisma.ContributionRequestWhereInput,
  how: { byId?: string; afterDays?: number } = {},
): Promise<string[]> {
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
  if (open.length === 0) return []

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
      payload: {
        requestId: request.id,
        ...(how.byId ? { byId: how.byId } : {}),
        ...(how.afterDays ? { after: how.afterDays } : {}),
      },
    })),
  )
  if (told.length > 0) await db.notification.createMany({ data: told })

  return open.map((request) => request.id)
}
