/**
 * FR-9.3 with D-6 (phase 14, item 6.13) — a calendar day is the sender's own
 * day, and the year on a profile ends on the reader's today.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { activityCalendar, recordActivity } from './activity'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('activity days (item 6.13)', () => {
  let db: PrismaClient
  let userId = ''

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    userId = (
      await db.user.create({
        data: {
          email: `ad-${run}@example.test`,
          username: `ad-${run}`,
          emailVerifiedAt: new Date(),
        },
        select: { id: true },
      })
    ).id
  })

  afterAll(async () => {
    await db.activityDay.deleteMany({ where: { userId } })
    await db.user.delete({ where: { id: userId } })
    await db.$disconnect()
  })

  it('marks the day it was where the sender was', async () => {
    const lateEvening = new Date('2026-03-01T22:30:00Z')
    await recordActivity(db, userId, lateEvening, 'Asia/Kolkata')
    await recordActivity(db, userId, lateEvening, 'UTC')
    await recordActivity(db, userId, lateEvening, 'UTC')
    const rows = await db.activityDay.findMany({
      where: { userId },
      orderBy: { day: 'asc' },
      select: { day: true, count: true },
    })
    expect(rows.map((row) => [row.day.toISOString().slice(0, 10), row.count])).toEqual([
      ['2026-03-01', 2],
      ['2026-03-02', 1],
    ])
  })

  it('ends the year on the reader’s today, with every day present', async () => {
    const readerNow = new Date('2026-03-01T22:30:00Z')
    const inIndia = await activityCalendar(db, userId, readerNow, 'Asia/Kolkata')
    expect(inIndia).toHaveLength(365)
    expect(inIndia[364]).toEqual({ day: '2026-03-02', count: 1 })
    expect(inIndia[363]).toEqual({ day: '2026-03-01', count: 2 })

    const inUtc = await activityCalendar(db, userId, readerNow, 'UTC')
    expect(inUtc).toHaveLength(365)
    expect(inUtc[364]).toEqual({ day: '2026-03-01', count: 2 })
    expect(inUtc.filter((day) => day.count > 0)).toHaveLength(1)
  })
})
