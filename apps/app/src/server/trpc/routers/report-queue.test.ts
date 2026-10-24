/**
 * FR-13.7 (phase 14, item 9.3) — the report queue pages past its first fifty.
 * Until this it stopped there, and the fifty-first report waited unseen
 * however long the moderator worked.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { REPORT_QUEUE_PAGE } from '@/lib/schemas/constants'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('the report queue, a page at a time (item 9.3)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let reporterId = ''
  let adminId = ''
  /** Oldest first, as the open queue is worked. */
  const filed: string[] = []

  /**
   * The administrator, as a hand-built context: the database allows only
   * one, and this must not take the role from whoever holds it here.
   */
  async function asTheAdmin() {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)({
      db,
      session: { user: { id: adminId, username: `rq-admin-${run}`, onboarded: true }, expires: '' },
      account: {
        status: 'ACTIVE',
        isAdmin: true,
        role: 'ADMIN' as const,
        grants: [],
        deletionRequestedAt: null,
        username: `rq-admin-${run}`,
      },
      headers: new Headers(),
    })
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    const [reporter, admin] = await Promise.all(
      ['reporter', 'admin'].map((label) =>
        db.user.create({
          data: {
            email: `rq-${label}-${run}@example.test`,
            username: `rq-${label}-${run}`,
            emailVerifiedAt: new Date(),
          },
          select: { id: true },
        }),
      ),
    )
    reporterId = reporter!.id
    adminId = admin!.id

    // One more than a page, filed long before anything else in the queue so
    // they lead it; two of them in the same instant, which the id must order.
    const start = new Date('2001-01-01T00:00:00Z').getTime()
    for (let index = 0; index <= REPORT_QUEUE_PAGE; index += 1) {
      const second = index === 1 ? 0 : index
      const row = await db.report.create({
        data: {
          reporterId,
          targetType: 'USER',
          targetId: `rq-${run}-${String(index).padStart(3, '0')}`,
          category: 'SPAM',
          createdAt: new Date(start + second * 1000),
        },
        select: { id: true, createdAt: true },
      })
      filed.push(row.id)
    }
    // The two filed at the same instant are worked in id order.
    const [first, second] = [filed[0]!, filed[1]!]
    if (second < first) {
      filed[0] = second
      filed[1] = first
    }
  })

  afterAll(async () => {
    await db.report.deleteMany({ where: { reporterId } })
    await db.user.deleteMany({ where: { id: { in: [reporterId, adminId] } } })
    await db.$disconnect()
  })

  it('shows a page of the oldest, and the rest from where it stopped', async () => {
    const admin = await asTheAdmin()
    const first = await admin.admin.reports({ state: 'OPEN' })
    expect(first.reports.map((report) => report.id)).toEqual(filed.slice(0, REPORT_QUEUE_PAGE))
    expect(first.nextCursor).not.toBeNull()
    expect(first.counts.OPEN).toBeGreaterThanOrEqual(filed.length)

    const second = await admin.admin.reports({ state: 'OPEN', cursor: first.nextCursor })
    expect(second.reports[0]?.id).toBe(filed[REPORT_QUEUE_PAGE])
  })

  it('keeps its place when a report on the first page is decided', async () => {
    const admin = await asTheAdmin()
    const first = await admin.admin.reports({ state: 'OPEN' })
    await admin.admin.decide({ reportId: filed[0]!, decision: 'DISMISSED' })

    const second = await admin.admin.reports({ state: 'OPEN', cursor: first.nextCursor })
    expect(second.reports[0]?.id).toBe(filed[REPORT_QUEUE_PAGE])
    // And the queue from the top now starts one further on.
    const again = await admin.admin.reports({ state: 'OPEN' })
    expect(again.reports[0]?.id).toBe(filed[1])
    expect(again.reports.map((report) => report.id)).toContain(filed[REPORT_QUEUE_PAGE])
  })
})
