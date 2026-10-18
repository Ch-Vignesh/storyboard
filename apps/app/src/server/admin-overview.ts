import type { Prisma, PrismaClient } from '@storyboard/db'

import { OVERVIEW_WINDOW_DAYS } from '@/lib/schemas/constants'

type Db = PrismaClient | Prisma.TransactionClient

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Decision 0043 (phase 14, item 2b.4) — what the admin sees first. Counts of
 * real activity: erased accounts, seeded stories and the help written on them
 * are left out, so the numbers say how the place is doing rather than how the
 * seed is. Counts, never pages; eleven of them, in parallel.
 */
export async function overviewCounts(db: Db, now: Date) {
  const since = (days: number) => new Date(now.getTime() - days * DAY_MS)
  const recent = since(OVERVIEW_WINDOW_DAYS.recent)
  const month = since(OVERVIEW_WINDOW_DAYS.month)
  const member = { status: { not: 'DELETED' as const } }
  const real = { isSeed: false, deletedAt: null }
  const onReal = { request: { storyboard: real } }

  const [
    total,
    newRecent,
    newMonth,
    seenRecent,
    seenMonth,
    stories,
    openRequests,
    sent,
    accepted,
    ideasHelped,
    openReports,
  ] = await Promise.all([
    db.user.count({ where: member }),
    db.user.count({ where: { ...member, createdAt: { gte: recent } } }),
    db.user.count({ where: { ...member, createdAt: { gte: month } } }),
    db.user.count({ where: { ...member, lastSeenAt: { gte: recent } } }),
    db.user.count({ where: { ...member, lastSeenAt: { gte: month } } }),
    db.storyboard.count({ where: real }),
    db.contributionRequest.count({
      where: { state: { in: ['OPEN', 'ANSWERED'] }, storyboard: real },
    }),
    db.suggestion.count({ where: { state: { not: 'DRAFT' }, ...onReal } }),
    db.suggestion.count({ where: { state: 'ACCEPTED', ...onReal } }),
    db.idea.count({ where: { markedHelpful: true, ...onReal } }),
    db.report.count({ where: { state: 'OPEN' } }),
  ])

  return {
    at: now,
    windows: OVERVIEW_WINDOW_DAYS,
    members: { total, newRecent, newMonth, seenRecent, seenMonth },
    stories,
    openRequests,
    suggestions: { sent, accepted },
    ideasHelped,
    openReports,
  }
}

export type Overview = Awaited<ReturnType<typeof overviewCounts>>
