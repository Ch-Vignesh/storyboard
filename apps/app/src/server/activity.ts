import 'server-only'

import type { Prisma, PrismaClient } from '@storyboard/db'

import { DEFAULT_TIME_ZONE, dayKeyInZone } from '@/lib/time-zone'

/**
 * The contribution calendar's data (FR-9.3).
 *
 * `ActivityDay` is one row per user per day with a count. Since phase 14's
 * item 6.13 it counts help given on other people's stories and nothing else
 * (D-6, decision 0049): a suggestion sent, or an idea posted, on a story the
 * sender does not write. Not a save of one's own, not a request opened, not a
 * decision made: sending is the work, and acceptance is the author's. It
 * counted all of those until then; the migration that came with the item
 * rebuilt every row from the suggestions and ideas themselves.
 *
 * Deliberately a counter rather than a query over the source tables: the grid
 * asks "how much did this person do on each of the last 365 days", and
 * answering that from two tables with different shapes, every time a profile
 * loads, is the kind of query that is fine at ten users and a problem at ten
 * thousand.
 *
 * A day is the sender's own (item 1.18): the zone the browser sent with the
 * call decides which date a late evening falls on. The days from before the
 * rebuild are UTC days, and the decision record says so.
 *
 * Called *after* the transaction that did the work, never inside it. A missing
 * square is a cosmetic loss; a failed send is not.
 */

type Db = PrismaClient | Prisma.TransactionClient

/** The row's `date` for a day key: midnight UTC of it, which is how a `date` column reads back. */
function dateOf(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00Z`)
}

/**
 * Record one piece of help given by a person, on the day it is where they are.
 *
 * Never throws: it is called from paths whose real work has already committed,
 * and a calendar square is not worth failing a request over.
 */
export async function recordActivity(
  db: Db,
  userId: string,
  when: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<void> {
  const day = dateOf(dayKeyInZone(when, timeZone))
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

export type CalendarDay = { day: string; count: number }

/**
 * The last 365 days, every day present, oldest first, ending on the day it is
 * now where the reader is.
 *
 * Days with no activity are returned as zeroes rather than omitted, because the
 * grid has to render a square for every day and filling the gaps in the
 * component would put the same calendar arithmetic in two places.
 */
export async function activityCalendar(
  db: Db,
  userId: string,
  today: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<CalendarDay[]> {
  const end = dateOf(dayKeyInZone(today, timeZone))
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
