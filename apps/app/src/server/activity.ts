import 'server-only'

import type { Prisma, PrismaClient } from '@storyboard/db'

/**
 * The contribution calendar's data (FR-9.3).
 *
 * `ActivityDay` is one row per user per day with a count. It is written on the
 * events that represent work — a version saved, a suggestion sent, an idea
 * posted, a decision made — and read as a 365-day grid on the profile.
 *
 * Deliberately a counter rather than a query over the source tables: the grid
 * asks "how much did this person do on each of the last 365 days", and
 * answering that from four tables with different shapes, every time a profile
 * loads, is the kind of query that is fine at ten users and a problem at ten
 * thousand.
 *
 * Called *after* the transaction that did the work, never inside it. A missing
 * square is a cosmetic loss; a failed acceptance is not.
 */

type Db = PrismaClient | Prisma.TransactionClient

/** Midnight UTC for the day an instant falls in. The column is a `date`. */
function dayOf(when: Date): Date {
  return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()))
}

/**
 * Record one unit of work for a user today.
 *
 * Never throws: it is called from paths whose real work has already committed,
 * and a calendar square is not worth failing a request over.
 */
export async function recordActivity(
  db: Db,
  userId: string,
  when: Date = new Date(),
): Promise<void> {
  const day = dayOf(when)
  try {
    await db.activityDay.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, count: 1 },
      update: { count: { increment: 1 } },
    })
  } catch {
    // Intentionally swallowed. See the note above.
  }
}

/** Several people at once, for an event that credits more than one. */
export async function recordActivityFor(
  db: Db,
  userIds: readonly string[],
  when: Date = new Date(),
): Promise<void> {
  await Promise.all([...new Set(userIds)].map((userId) => recordActivity(db, userId, when)))
}

export type CalendarDay = { day: string; count: number }

/**
 * The last 365 days, every day present, oldest first.
 *
 * Days with no activity are returned as zeroes rather than omitted, because the
 * grid has to render a square for every day and filling the gaps in the
 * component would put the same calendar arithmetic in two places.
 */
export async function activityCalendar(
  db: Db,
  userId: string,
  today: Date = new Date(),
): Promise<CalendarDay[]> {
  const end = dayOf(today)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 364)

  const rows = await db.activityDay.findMany({
    where: { userId, day: { gte: start, lte: end } },
    select: { day: true, count: true },
  })

  const counts = new Map(rows.map((row) => [row.day.toISOString().slice(0, 10), row.count]))

  const days: CalendarDay[] = []
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10)
    days.push({ day: key, count: counts.get(key) ?? 0 })
  }
  return days
}
