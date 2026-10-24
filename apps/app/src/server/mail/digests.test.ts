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
  const email = `digests-${run}@example.test`

  /**
   * A digest run emails everybody with something waiting — that is what a cron
   * job is for. These tests share a database with the flow tests, which leave
   * real notifications behind, so every assertion here is about the messages
   * addressed to this test's own person.
   */
  const mineIn = (mailer: { sent: Mail[] }) => mailer.sent.filter((mail) => mail.to === email)

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    const user = await db.user.create({
      data: {
        email,
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

  it('defines a delivery class and copy for every type (FR-12.2)', () => {
    // The count is asserted so that adding a type is a deliberate act — a new
    // one with no label and no delivery class would otherwise be silently
    // undeliverable. It went from twelve to thirteen when REQUEST_CLOSED
    // arrived with FR-2.7, to fourteen with REQUEST_REOPENED (FR-5.9), to
    // fifteen with IDEA_REPLY (FR-6.9, phase 14 item 1.9), to sixteen with
    // SUGGESTION_WITHDRAWN (FR-6.5, item 1.10), to seventeen with
    // REQUEST_AUTO_CLOSED (FR-11.3 with D-8, item 6.15) and to eighteen with
    // SPIN_OFF_PUBLISHED (decision 0044, item 7b.4).
    expect(NOTIFICATION_TYPES).toHaveLength(18)
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
    await runImmediate(db, { mailer })

    const mine = mineIn(mailer)
    expect(mine).toHaveLength(IMMEDIATE_TYPES.length)
    // Every immediate type produced a message with its own subject.
    for (const type of IMMEDIATE_TYPES) {
      expect(
        mine.some((mail) => mail.subject.includes(NOTIFICATIONS[type].label)),
        `${type} should have been emailed`,
      ).toBe(true)
    }
    // FR-12.5 — plain text alongside the HTML, and a canonical link.
    for (const mail of mine) {
      expect(mail.text.length).toBeGreaterThan(0)
      expect(mail.text).toContain('http')
      expect(mail.html).not.toContain('<img')
    }
  })

  /**
   * 2026-10-16 spec review: the link was built from the payload, and most
   * payloads hold only ids, so a decision on your suggestion linked to the
   * notification list, where the row had no link either.
   */
  it('links a decision to the suggestion it is about', async () => {
    await db.notification.deleteMany({ where: { userId } })
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `dg${run}`,
        slug: `digest-link-${run}`,
        title: 'Digest link',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: userId,
      },
      select: { id: true, slug: true },
    })
    try {
      const version = await db.version.create({
        data: {
          storyboardId: storyboard.id,
          name: 'Main draft',
          isMain: true,
          createdById: userId,
        },
        select: { id: true },
      })
      const chapter = await db.chapter.create({
        data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
        select: { id: true },
      })
      const section = await db.section.create({
        data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0 },
        select: { id: true },
      })
      const revision = await db.revision.create({
        data: {
          sectionId: section.id,
          contentJson: { type: 'doc', content: [] },
          contentText: '',
          wordCount: 0,
          contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
          source: 'AUTHORED',
          authorId: userId,
        },
        select: { id: true },
      })
      const request = await db.contributionRequest.create({
        data: {
          publicId: `rq${run}`,
          storyboardId: storyboard.id,
          sectionId: section.id,
          openedById: userId,
          kind: 'REWRITE',
          title: 'The harbour scene',
          ask: 'Shorter.',
          minWords: 1,
          maxWords: 100,
        },
        select: { id: true, publicId: true },
      })
      const suggestion = await db.suggestion.create({
        data: {
          publicId: `sg${run}`,
          requestId: request.id,
          contributorId: userId,
          baseRevisionId: revision.id,
          contentJson: { type: 'doc', content: [] },
          contentText: 'Shorter.',
          state: 'PASSED',
          submittedAt: new Date(),
        },
        select: { id: true, publicId: true },
      })
      await db.notification.create({
        data: {
          userId,
          type: 'SUGGESTION_PASSED',
          payload: { suggestionId: suggestion.id, requestId: request.id },
        },
      })

      const mailer = recordingMailer()
      await runImmediate(db, { mailer })

      const [mail] = mineIn(mailer)
      expect(mail?.text).toContain(
        `/s/${storyboard.slug}/help/${request.publicId}/s/${suggestion.publicId}`,
      )
      expect(mail?.subject).toContain('The harbour scene')
    } finally {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
        const where = { chapter: { version: { storyboardId: storyboard.id } } }
        await tx.section.updateMany({ where, data: { currentRevisionId: null } })
        await tx.contributionRequest.deleteMany({ where: { storyboardId: storyboard.id } })
        await tx.revision.deleteMany({ where: { section: where } })
        await tx.section.deleteMany({ where })
        await tx.chapter.deleteMany({ where: { version: { storyboardId: storyboard.id } } })
        await tx.version.deleteMany({ where: { storyboardId: storyboard.id } })
        await tx.storyboard.delete({ where: { id: storyboard.id } })
      })
    }
  })

  it('batches the hourly types into one message per person (FR-12.3)', async () => {
    await seedOneOfEach()
    await runImmediate(db, { mailer: recordingMailer() })

    const mailer = recordingMailer()
    await runHourlyDigest(db, { mailer })

    const mine = mineIn(mailer)
    // FR-12.3 — one message, however many notifications went into it.
    expect(mine).toHaveLength(1)
    const digest = mine[0]!
    for (const type of HOURLY_TYPES) {
      expect(digest.text, `${type} should be in the digest`).toContain(NOTIFICATIONS[type].label)
    }
  })

  it('does not send the same notification twice', async () => {
    await seedOneOfEach()
    await runImmediate(db, { mailer: recordingMailer() })

    const second = recordingMailer()
    await runImmediate(db, { mailer: second })
    expect(mineIn(second)).toHaveLength(0)
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
      mineIn(mailer).some((mail) => mail.subject.includes(NOTIFICATIONS[type].label)),
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
    try {
      const mailer = recordingMailer()
      await runImmediate(db, { mailer })
      expect(mineIn(mailer)).toHaveLength(0)

      // Phase 12 audit: and the rows leave the queue. Left unmarked at its
      // head, 500 of them stopped every run from reaching anybody else.
      const stuck = await db.notification.count({
        where: { userId, emailedAt: null, type: { in: [...IMMEDIATE_TYPES] } },
      })
      expect(stuck).toBe(0)
    } finally {
      await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } })
    }
  })

  /**
   * Phase 12 audit. Every send sat in one loop with one mark at the end, so
   * one failure left every row unmarked and the next run sent them all again.
   */
  it('sends the rest when one fails, and sends nothing twice', async () => {
    await seedOneOfEach()
    let failedOnce = false
    const sent: Mail[] = []
    const flaky: Mailer = {
      send(mail) {
        if (mail.to === email && !failedOnce) {
          failedOnce = true
          return Promise.reject(new Error('421 try again later'))
        }
        sent.push(mail)
        return Promise.resolve()
      },
    }

    await runImmediate(db, { mailer: flaky })
    expect(mineIn({ sent })).toHaveLength(IMMEDIATE_TYPES.length - 1)

    // The next run sends the one that failed, and only that one.
    const next = recordingMailer()
    await runImmediate(db, { mailer: next })
    expect(mineIn(next)).toHaveLength(1)
  })

  it('stops a run the provider is refusing outright, and marks nothing it did not send', async () => {
    const { DIGEST_FAILURES_BEFORE_STOPPING } = await import('@/lib/schemas/constants')
    await seedOneOfEach()
    let attempts = 0
    const refusing: Mailer = {
      send() {
        attempts += 1
        return Promise.reject(new Error('550 daily sending quota exceeded'))
      },
    }

    const result = await runImmediate(db, { mailer: refusing })

    expect(result.sent).toBe(0)
    expect(attempts).toBe(DIGEST_FAILURES_BEFORE_STOPPING)
    const unsent = await db.notification.count({
      where: { userId, emailedAt: null, type: { in: [...IMMEDIATE_TYPES] } },
    })
    expect(unsent).toBe(IMMEDIATE_TYPES.length)
  })

  it('never queues mail for an address nobody confirmed', async () => {
    await seedOneOfEach()
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: null } })
    try {
      const mailer = recordingMailer()
      await runImmediate(db, { mailer })
      expect(mineIn(mailer)).toHaveLength(0)
    } finally {
      await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } })
    }
  })

  it('sends no weekly digest when the week was empty (FR-15.1)', async () => {
    // This user has pinned no genres, so there is nothing to summarise. An
    // empty week is not worth an email.
    const mailer = recordingMailer()
    await runWeeklyDigest(db, new Date(), { mailer })
    expect(mineIn(mailer)).toHaveLength(0)
  })

  /**
   * Phase 14, item 10.6 (the phase 12 audit's H6b) — nothing recorded whom the
   * weekly digest had gone to, so a run repeated by hand, or a late run
   * followed by the next one, sent it to everybody again.
   */
  it('sends the weekly digest once, however often the run is repeated', async () => {
    const genre = await db.genre.findFirstOrThrow({ select: { id: true } })
    const readerEmail = `weekly-${run}@example.test`
    const reader = await db.user.create({
      data: {
        email: readerEmail,
        username: `wk_${run}`,
        emailVerifiedAt: new Date(),
        onboardedAt: new Date(),
        pinnedGenres: { create: { genreId: genre.id, order: 0 } },
      },
      select: { id: true },
    })
    // Something open this week in the genre the reader pinned, by somebody else.
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `wk${run}`,
        slug: `weekly-digest-${run}`,
        title: 'Weekly digest',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: userId,
        genres: { create: { genreId: genre.id } },
      },
      select: { id: true },
    })
    const toReader = (mailer: { sent: Mail[] }) =>
      mailer.sent.filter((mail) => mail.to === readerEmail)
    try {
      const version = await db.version.create({
        data: {
          storyboardId: storyboard.id,
          name: 'Main draft',
          isMain: true,
          createdById: userId,
        },
        select: { id: true },
      })
      const chapter = await db.chapter.create({
        data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
        select: { id: true },
      })
      const section = await db.section.create({
        data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0 },
        select: { id: true },
      })
      await db.contributionRequest.create({
        data: {
          publicId: `wq${run}`,
          storyboardId: storyboard.id,
          sectionId: section.id,
          openedById: userId,
          kind: 'UNBLOCK',
          title: 'The pier at night',
          ask: 'Where does she go next?',
          minWords: 1,
          maxWords: 100,
        },
      })

      const before = await db.user.findUniqueOrThrow({
        where: { id: reader.id },
        select: { updatedAt: true },
      })
      const first = recordingMailer()
      await runWeeklyDigest(db, new Date(), { mailer: first })
      expect(toReader(first)).toHaveLength(1)
      const stamped = await db.user.findUniqueOrThrow({
        where: { id: reader.id },
        select: { weeklyDigestSentAt: true, updatedAt: true },
      })
      expect(stamped.weeklyDigestSentAt).not.toBeNull()
      // Plain SQL, as `lastSeenAt` is: the account itself did not change.
      expect(stamped.updatedAt).toEqual(before.updatedAt)

      // The same run again a minute later, as a run by hand would be: nothing.
      const again = recordingMailer()
      await runWeeklyDigest(db, new Date(Date.now() + 60_000), { mailer: again })
      expect(toReader(again)).toHaveLength(0)

      // Once the gap has passed, next week's goes as usual.
      const { WEEKLY_DIGEST_MIN_GAP_DAYS } = await import('@/lib/schemas/constants')
      const longAgo = new Date(Date.now() - (WEEKLY_DIGEST_MIN_GAP_DAYS * 24 + 1) * 60 * 60 * 1000)
      await db.$executeRaw`UPDATE "User" SET "weeklyDigestSentAt" = ${longAgo} WHERE "id" = ${reader.id}`
      const nextWeek = recordingMailer()
      await runWeeklyDigest(db, new Date(), { mailer: nextWeek })
      expect(toReader(nextWeek)).toHaveLength(1)
    } finally {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
        const where = { chapter: { version: { storyboardId: storyboard.id } } }
        await tx.contributionRequest.deleteMany({ where: { storyboardId: storyboard.id } })
        await tx.section.deleteMany({ where })
        await tx.chapter.deleteMany({ where: { version: { storyboardId: storyboard.id } } })
        await tx.version.deleteMany({ where: { storyboardId: storyboard.id } })
        await tx.storyboard.delete({ where: { id: storyboard.id } })
        await tx.user.delete({ where: { id: reader.id } })
      })
    }
  })

  it('the quiet nudge never says the request failed, nor offers what does not exist (FR-12.4)', async () => {
    // Asserted on the template rather than a seeded request: the wording is the
    // requirement, and it is what a nudged author actually reads.
    const { quietRequestMail } = await import('./templates/notification')
    const mail = quietRequestMail({
      to: 'someone@example.test',
      requestTitle: 'Chapter four will not start',
      requestUrl: 'https://example.test/s/a/help/b',
      editUrl: 'https://example.test/s/a/help/b/edit',
      appUrl: 'https://example.test',
      unsubscribeUrl: 'http://t/unsubscribe?t=x',
    })

    expect(mail.text).toMatch(/not a verdict/i)
    // Item 6.16 — the fix is offered where it is made: the request's edit page.
    expect(mail.text).toContain('Change the word range: https://example.test/s/a/help/b/edit')
    expect(mail.html).toContain(
      'href="https://example.test/s/a/help/b/edit">Change the word range</a>',
    )
    expect(mail.text).not.toMatch(/close it and ask again/i)
    // What a writer can actually do, and nothing that is not built: it
    // offered a one-click widening and a place in a digest that never takes a
    // week-old request, until the 2026-10-16 spec review.
    expect(mail.text).toContain('No answers yet')
    expect(mail.text).not.toMatch(/digest|widen=/i)
    // The words the requirement is written to avoid.
    expect(mail.text).not.toMatch(/\bfailed\b|\bunsuccessful\b|\bnobody wants\b/i)
  })
})
