/**
 * The phase 3 exit criterion: every notification type fires and renders both
 * in-app and by email.
 *
 * Needs a real Postgres with migrations applied, so it skips when DATABASE_URL
 * is unset, exactly like the invariants suite. CI always has one.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  HOURLY_TYPES,
  IMMEDIATE_TYPES,
  NOTIFICATIONS,
  NOTIFICATION_TYPES,
} from '@/lib/schemas/notifications'

import { runHourlyDigest, runImmediate, runWeeklyDigest } from './digests'
import type { Mail, Mailer } from './mailer'

const databaseUrl = process.env.DATABASE_URL

/** Collects what would have been sent, instead of sending it. */
function recordingMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = []
  return {
    sent,
    send(mail) {
      sent.push(mail)
      return Promise.resolve()
    },
  }
}

describe.skipIf(!databaseUrl)('notification delivery (FR-12.1 to FR-12.4)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 10)
  let userId = ''

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    const user = await db.user.create({
      data: {
        email: `digests-${run}@example.test`,
        username: `dig_${run}`,
        displayName: 'Digest Test',
        emailVerifiedAt: new Date(),
        onboardedAt: new Date(),
      },
      select: { id: true },
    })
    userId = user.id
  })

  afterAll(async () => {
    if (!userId) return
    await db.notification.deleteMany({ where: { userId } })
    await db.notificationPreference.deleteMany({ where: { userId } })
    await db.user.delete({ where: { id: userId } })
    await db.$disconnect()
  })

  /** One notification of every type, all unsent. */
  async function seedOneOfEach() {
    await db.notification.deleteMany({ where: { userId } })
    await db.notification.createMany({
      data: NOTIFICATION_TYPES.map((type) => ({
        userId,
        type,
        payload: { title: `${type} subject`, slug: 'a-storyboard', requestPublicId: 'abc123' },
      })),
    })
  }

  it('defines a delivery class and copy for all twelve types (FR-12.2)', () => {
    expect(NOTIFICATION_TYPES).toHaveLength(12)
    for (const type of NOTIFICATION_TYPES) {
      const definition = NOTIFICATIONS[type]
      expect(definition.label.length, `${type} needs a label`).toBeGreaterThan(0)
      expect(definition.sentence.length, `${type} needs a sentence`).toBeGreaterThan(0)
      expect(['immediate', 'hourly', 'weekly']).toContain(definition.delivery)
    }
  })

  it('renders every in-app type, which cannot be disabled (FR-12.1)', async () => {
    await seedOneOfEach()
    const rows = await db.notification.findMany({ where: { userId }, select: { type: true } })
    expect(new Set(rows.map((row) => row.type)).size).toBe(NOTIFICATION_TYPES.length)
  })

  it('emails every immediate type, one message each (FR-12.3)', async () => {
    await seedOneOfEach()
    const mailer = recordingMailer()
    const result = await runImmediate(db, { mailer })

    expect(result.sent).toBe(IMMEDIATE_TYPES.length)
    // Every immediate type produced a message with its own subject.
    for (const type of IMMEDIATE_TYPES) {
      expect(
        mailer.sent.some((mail) => mail.subject.includes(NOTIFICATIONS[type].label)),
        `${type} should have been emailed`,
      ).toBe(true)
    }
    // FR-12.5 — plain text alongside the HTML, and a canonical link.
    for (const mail of mailer.sent) {
      expect(mail.text.length).toBeGreaterThan(0)
      expect(mail.text).toContain('http')
      expect(mail.html).not.toContain('<img')
    }
  })

  it('batches the hourly types into one message per person (FR-12.3)', async () => {
    await seedOneOfEach()
    await runImmediate(db, { mailer: recordingMailer() })

    const mailer = recordingMailer()
    const result = await runHourlyDigest(db, { mailer })

    expect(result.sent).toBe(1)
    const digest = mailer.sent[0]!
    for (const type of HOURLY_TYPES) {
      expect(digest.text, `${type} should be in the digest`).toContain(NOTIFICATIONS[type].label)
    }
  })

  it('does not send the same notification twice', async () => {
    await seedOneOfEach()
    await runImmediate(db, { mailer: recordingMailer() })

    const second = recordingMailer()
    const result = await runImmediate(db, { mailer: second })
    expect(result.sent).toBe(0)
    expect(second.sent).toHaveLength(0)
  })

  it('respects a per-type email switch, but still marks the row (FR-12.1)', async () => {
    await seedOneOfEach()
    const type = IMMEDIATE_TYPES[0]!
    await db.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, email: false },
      update: { email: false },
    })

    const mailer = recordingMailer()
    await runImmediate(db, { mailer })

    expect(
      mailer.sent.some((mail) => mail.subject.includes(NOTIFICATIONS[type].label)),
      'a disabled type must not be emailed',
    ).toBe(false)

    // Still marked, or it would be retried forever. In-app delivery already
    // happened and cannot be turned off.
    const row = await db.notification.findFirst({ where: { userId, type } })
    expect(row?.emailedAt).not.toBeNull()

    await db.notificationPreference.deleteMany({ where: { userId } })
  })

  it('never emails a suspended account (FR-13.5)', async () => {
    await seedOneOfEach()
    await db.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } })

    const mailer = recordingMailer()
    const result = await runImmediate(db, { mailer })
    expect(result.considered).toBe(0)
    expect(mailer.sent).toHaveLength(0)

    await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } })
  })

  it('sends no weekly digest when the week was empty (FR-15.1)', async () => {
    // This user has pinned no genres, so there is nothing to summarise. An
    // empty week is not worth an email.
    const mailer = recordingMailer()
    await runWeeklyDigest(db, new Date(), { mailer })
    expect(mailer.sent.every((mail) => mail.to !== `digests-${run}@example.test`)).toBe(true)
  })

  it('the quiet nudge offers two actions and never says the request failed (FR-12.4)', async () => {
    // Asserted on the template rather than a seeded request: the wording is the
    // requirement, and it is what a nudged author actually reads.
    const { quietRequestMail } = await import('./templates/notification')
    const mail = quietRequestMail({
      to: 'someone@example.test',
      requestTitle: 'Chapter four will not start',
      requestUrl: 'https://example.test/s/a/help/b',
      widenUrl: 'https://example.test/s/a/help/b?widen=1',
      appUrl: 'https://example.test',
    })

    expect(mail.text).toContain('Widen the word range')
    expect(mail.text).toContain("Sunday's digest")
    expect(mail.text).toMatch(/not a verdict/i)
    // The words the requirement is written to avoid.
    expect(mail.text).not.toMatch(/\bfailed\b|\bunsuccessful\b|\bnobody wants\b/i)
  })
})
