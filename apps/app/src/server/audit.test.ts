/**
 * Phase 14, item 10.2 (NFR-7) — socially significant events are kept.
 *
 * The first block needs nothing. The rest needs a real Postgres with
 * migrations applied, so it skips when DATABASE_URL is unset; CI always has
 * one. Every row it writes belongs to accounts it made, and goes with them.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { AUDIT_EVENT_NAMES, describeAuditEvent } from '@/lib/audit-events'
import { AUDIT_LOG } from '@/lib/schemas/constants'
import type { Mail } from '@/server/mail/mailer'

import { auditEvents, pruneAuditEvents, recordEvent, slugFrom } from './audit'

let signedIn: { id: string; username: string } | null = null

vi.mock('@/auth', () => ({
  auth: async () =>
    signedIn
      ? { user: { id: signedIn.id, username: signedIn.username, onboarded: true }, expires: '' }
      : null,
}))

/** Nothing is sent: the deletion notice is not what is under test. */
const noMail = { send: (_mail: Mail) => Promise.resolve() }

vi.mock('@/server/mail/mailer', () => ({ getMailer: () => noMail }))

describe('how the Events screen says each event (item 10.2)', () => {
  it('has words for every event that is stored', () => {
    for (const event of AUDIT_EVENT_NAMES) {
      expect(describeAuditEvent(event, 'USER', null), event).not.toBe(event)
    }
  })

  it('reads a decision from the detail', () => {
    expect(describeAuditEvent('admin.user_status', 'USER', { status: 'SUSPENDED' })).toBe(
      'suspended an account',
    )
    expect(describeAuditEvent('admin.user_status', 'USER', { status: 'ACTIVE' })).toBe(
      'lifted a suspension',
    )
    expect(describeAuditEvent('admin.report_decided', 'IDEA', { decision: 'UPHELD' })).toBe(
      'upheld a report about an idea',
    )
  })

  it('finds a story by its slug or by any address of it', () => {
    expect(slugFrom('the-ship-never-lands-k3x9q2')).toBe('the-ship-never-lands-k3x9q2')
    expect(slugFrom('https://draftboard.example/s/the-ship-k3x9q2/help/abc')).toBe(
      'the-ship-k3x9q2',
    )
    expect(slugFrom('/s/the-ship-k3x9q2?tab=1')).toBe('the-ship-k3x9q2')
  })
})

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('keeping the events (item 10.2)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  const people: string[] = []
  const stories: string[] = []

  async function person(label: string, extra: { deletionRequestedAt?: Date } = {}) {
    const username = `ae-${label}-${run}`
    const row = await db.user.create({
      data: {
        email: `${username}@example.test`,
        username,
        emailVerifiedAt: new Date(),
        onboardedAt: new Date(),
        ...extra,
      },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username, email: `${username}@example.test` }
  }

  async function story(ownerId: string, label: string) {
    const row = await db.storyboard.create({
      data: {
        publicId: `ae${label}${run}`,
        slug: `audit-${label}-${run}`,
        title: `Audit ${label}`,
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId,
      },
      select: { id: true, slug: true },
    })
    stories.push(row.id)
    return row
  }

  /** The events about these accounts, oldest first. */
  async function eventsAbout(...ids: string[]) {
    return db.auditEvent.findMany({
      where: { OR: [{ actorId: { in: ids } }, { subjectId: { in: ids } }] },
      orderBy: { createdAt: 'asc' },
    })
  }

  async function as(who: { id: string; username: string } | null) {
    signedIn = who
    const { createCallerFactory, createTRPCContext } = await import('./trpc/init')
    const { appRouter } = await import('./trpc/routers/_app')
    return createCallerFactory(appRouter)(await createTRPCContext({ headers: new Headers() }))
  }

  /**
   * The admin, as a hand-built context: the database allows one admin, and
   * this must not take the role from whoever holds it here. `db` is whatever
   * the test hands it.
   */
  async function asTheAdmin(who: { id: string; username: string }, client: PrismaClient = db) {
    const { createCallerFactory } = await import('./trpc/init')
    const { appRouter } = await import('./trpc/routers/_app')
    return createCallerFactory(appRouter)({
      db: client,
      session: { user: { id: who.id, username: who.username, onboarded: true }, expires: '' },
      account: {
        status: 'ACTIVE',
        isAdmin: true,
        role: 'ADMIN' as const,
        grants: [],
        deletionRequestedAt: null,
        username: who.username,
      },
      headers: new Headers(),
    })
  }

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    signedIn = null
    await db.auditEvent.deleteMany({
      where: {
        OR: [
          { actorId: { in: people } },
          { subjectId: { in: people } },
          { storyboardId: { in: stories } },
        ],
      },
    })
    await db.report.deleteMany({ where: { reporterId: { in: people } } })
    await db.storyboard.deleteMany({ where: { id: { in: stories } } })
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('stores who, about whom, where and what, and finds the story and the person when left out', async () => {
    const author = await person('author')
    const helper = await person('helper')
    const where = await story(author.id, 'found')
    await recordEvent(db, {
      event: 'spinoff.created',
      actorId: helper.id,
      target: { type: 'STORYBOARD', id: where.id },
    })
    const [row] = await eventsAbout(helper.id)
    expect(row).toMatchObject({
      event: 'spinoff.created',
      actorId: helper.id,
      subjectId: author.id,
      storyboardId: where.id,
      targetType: 'STORYBOARD',
      targetId: where.id,
    })
  })

  it('never throws when the row cannot be written', async () => {
    const broken = {
      auditEvent: { create: () => Promise.reject(new Error('connection refused')) },
    } as unknown as PrismaClient
    await expect(
      recordEvent(broken, { event: 'purge.account', actorId: null }),
    ).resolves.toBeUndefined()
  })

  it('is kept for its retention, then pruned', async () => {
    const someone = await person('pruned')
    const day = 24 * 60 * 60 * 1000
    const now = new Date()
    await db.auditEvent.createMany({
      data: [
        {
          event: 'account.deletion_requested',
          actorId: someone.id,
          createdAt: new Date(now.getTime() - (AUDIT_LOG.retentionDays + 1) * day),
        },
        {
          event: 'account.deletion_cancelled',
          actorId: someone.id,
          createdAt: new Date(now.getTime() - (AUDIT_LOG.retentionDays - 1) * day),
        },
      ],
    })
    await pruneAuditEvents(db, now)
    expect((await eventsAbout(someone.id)).map((row) => row.event)).toEqual([
      'account.deletion_cancelled',
    ])
  })

  it('lists by story and by person, newest first, a page at a time', async () => {
    const author = await person('lister')
    const other = await person('other')
    const mine = await story(author.id, 'listed')
    const theirs = await story(other.id, 'unlisted')
    const base = Date.now() - 60 * 60 * 1000
    await db.auditEvent.createMany({
      data: [
        ...Array.from({ length: AUDIT_LOG.page + 2 }, (_, index) => ({
          event: 'suggestion.passed',
          actorId: author.id,
          subjectId: other.id,
          storyboardId: mine.id,
          createdAt: new Date(base + index * 1000),
        })),
        { event: 'report.created', actorId: other.id, storyboardId: theirs.id },
      ],
    })

    const first = await auditEvents(db, { story: `https://draftboard.example/s/${mine.slug}` })
    expect(first.unknown).toBeNull()
    expect(first.story?.title).toBe('Audit listed')
    expect(first.events).toHaveLength(AUDIT_LOG.page)
    expect(first.events[0]?.at.getTime()).toBeGreaterThan(first.events[1]?.at.getTime() ?? 0)
    expect(first.events[0]).toMatchObject({
      actor: `@${author.username}`,
      subject: `@${other.username}`,
      story: { title: 'Audit listed', slug: mine.slug },
    })
    const rest = await auditEvents(db, { story: mine.slug, cursor: first.nextCursor ?? undefined })
    expect(rest.events).toHaveLength(2)
    expect(rest.nextCursor).toBeNull()

    // The person: what they did, and what was done about them.
    const theirsToo = await auditEvents(db, { person: `@${other.username}` })
    expect(theirsToo.events.some((entry) => entry.event === 'report.created')).toBe(true)
    expect(theirsToo.events.some((entry) => entry.event === 'suggestion.passed')).toBe(true)
    const byEmail = await auditEvents(db, { person: other.email.toUpperCase() })
    expect(byEmail.person?.name).toBe(`@${other.username}`)

    expect((await auditEvents(db, { story: 'no-such-story' })).unknown).toBe('story')
    expect((await auditEvents(db, { person: 'nobody-by-that-name' })).unknown).toBe('person')
  })

  it('records a pass, an accept, a restore and a promotion beside their log lines', async () => {
    const owner = await person('loopowner')
    const helper = await person('loophelper')
    const prose = (text: string) => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })
    const asMember = async (who: { id: string; username: string }) => {
      const { createCallerFactory } = await import('./trpc/init')
      const { appRouter } = await import('./trpc/routers/_app')
      return createCallerFactory(appRouter)({
        db,
        session: { user: { id: who.id, username: who.username, onboarded: true }, expires: '' },
        account: {
          status: 'ACTIVE',
          isAdmin: false,
          role: 'USER' as const,
          grants: [],
          deletionRequestedAt: null,
          username: who.username,
        },
        headers: new Headers(),
      })
    }

    const { id: storyboardId } = await story(owner.id, 'loop')
    const version = await db.version.create({
      data: { storyboardId, name: 'Main draft', isMain: true, createdById: owner.id },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 7 },
      select: { id: true },
    })
    const text = 'The harbour had been empty for a year.'
    const original = await db.revision.create({
      data: {
        sectionId: section.id,
        contentJson: prose(text),
        contentText: text,
        wordCount: 7,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: owner.id,
      },
      select: { id: true },
    })
    await db.section.update({
      where: { id: section.id },
      data: { currentRevisionId: original.id },
    })
    const request = await db.contributionRequest.create({
      data: {
        publicId: randomUUID().replaceAll('-', '').slice(0, 10),
        storyboardId,
        sectionId: section.id,
        openedById: owner.id,
        kind: 'REWRITE',
        title: 'Make it land',
        ask: 'Shorter.',
        minWords: 1,
        maxWords: 1000,
      },
      select: { id: true },
    })

    try {
      const helperCall = await asMember(helper)
      const ownerCall = await asMember(owner)
      const send = async (words: string) => {
        const draft = await helperCall.suggestion.startDraft({ requestId: request.id })
        await helperCall.suggestion.saveDraft({ suggestionId: draft.id, contentJson: prose(words) })
        await helperCall.suggestion.submit({ suggestionId: draft.id })
        return draft.id
      }

      const passed = await send('It was empty.')
      await ownerCall.suggestion.pass({ suggestionId: passed, reason: 'NOT_THE_DIRECTION' })
      const accepted = await send('The harbour was empty.')
      await ownerCall.suggestion.accept({ suggestionId: accepted })
      await ownerCall.section.restoreRevision({ sectionId: section.id, revisionId: original.id })
      const alternate = await ownerCall.version.create({
        baseVersionId: version.id,
        name: 'Another way',
      })
      await ownerCall.version.promoteToMain({ versionId: alternate.id })

      const rows = await db.auditEvent.findMany({
        where: { storyboardId },
        orderBy: { createdAt: 'asc' },
      })
      expect(rows.map((row) => row.event)).toEqual([
        'suggestion.passed',
        'suggestion.accepted',
        'section.restore',
        'version.promoted',
      ])
      expect(rows[0]).toMatchObject({
        actorId: owner.id,
        subjectId: helper.id,
        targetType: 'SUGGESTION',
        targetId: passed,
        detail: { reason: 'NOT_THE_DIRECTION' },
      })
      expect(rows[1]).toMatchObject({ actorId: owner.id, subjectId: helper.id, targetId: accepted })
      expect(rows[2]).toMatchObject({
        actorId: owner.id,
        targetType: 'SECTION',
        targetId: section.id,
        detail: { restoredFrom: original.id, creditsNoLongerLive: 1 },
      })
      expect(rows[3]).toMatchObject({
        actorId: owner.id,
        targetType: 'VERSION',
        targetId: alternate.id,
      })
      // Nobody's words: not the suggestion's, not the section's.
      expect(JSON.stringify(rows)).not.toContain('harbour')
    } finally {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
        const where = { chapter: { version: { storyboardId } } }
        const sectionIds = (await tx.section.findMany({ where, select: { id: true } })).map(
          (row) => row.id,
        )
        await tx.section.updateMany({ where, data: { currentRevisionId: null } })
        await tx.credit.deleteMany({ where: { storyboardId } })
        // One statement, as the integrity suite does: deleting a suggestion
        // alone would update the revision that points at it, which NFR-3's
        // trigger refuses.
        await tx.$executeRaw`
          WITH gone AS (
            DELETE FROM "Suggestion" AS s USING "ContributionRequest" AS r
            WHERE s."requestId" = r."id" AND r."storyboardId" = ${storyboardId}
          )
          DELETE FROM "Revision" WHERE "sectionId" = ANY(${sectionIds})`
        await tx.contributionRequest.deleteMany({ where: { storyboardId } })
        await tx.section.deleteMany({ where })
        await tx.chapter.deleteMany({ where: { version: { storyboardId } } })
        await tx.version.deleteMany({ where: { storyboardId } })
        await tx.storyboard.deleteMany({ where: { id: storyboardId } })
        await tx.rateLimitHit.deleteMany({
          where: { OR: [owner.id, helper.id].map((id) => ({ key: { endsWith: id } })) },
        })
      })
    }
  })

  it("records a report, with the story and the person it is about, and not the reporter's note", async () => {
    const owner = await person('reported')
    const reporter = await person('reporter')
    const reported = await story(owner.id, 'reported')
    await (
      await as(reporter)
    ).report.create({
      targetType: 'STORYBOARD',
      targetId: reported.id,
      category: 'SPAM',
      note: 'Copied from a book I own, word for word.',
    })
    const [row] = await eventsAbout(reporter.id)
    expect(row).toMatchObject({
      event: 'report.created',
      actorId: reporter.id,
      subjectId: owner.id,
      storyboardId: reported.id,
      detail: { category: 'SPAM' },
    })
    expect(JSON.stringify(row)).not.toContain('word for word')
  })

  it('records a deletion asked for and called off, and one carried out', async () => {
    const leaving = await person('leaving')
    const caller = await as(leaving)
    await caller.settings.requestDeletion({ confirm: leaving.username })
    await caller.settings.cancelDeletion()
    expect((await eventsAbout(leaving.id)).map((row) => row.event)).toEqual([
      'account.deletion_requested',
      'account.deletion_cancelled',
    ])

    const { ACCOUNT_DELETION_GRACE_DAYS } = await import('@/lib/schemas/constants')
    const gone = await person('gone', {
      deletionRequestedAt: new Date(Date.now() - (ACCOUNT_DELETION_GRACE_DAYS + 1) * 86_400_000),
    })
    const { purgeDeletedAccounts } = await import('./purge/accounts')
    await purgeDeletedAccounts(db, new Date(), noMail)
    const [erased] = await eventsAbout(gone.id)
    expect(erased).toMatchObject({ event: 'purge.account', actorId: null, subjectId: gone.id })
  })

  it("records an administrator's decision, and never fails it when the record cannot be written", async () => {
    const admin = await person('admin')
    const member = await person('member')
    await (
      await asTheAdmin(admin)
    ).admin.setUserStatus({ userId: member.id, status: 'SUSPENDED', note: 'Spam, three times.' })
    const [suspended] = await eventsAbout(member.id)
    expect(suspended).toMatchObject({
      event: 'admin.user_status',
      actorId: admin.id,
      subjectId: member.id,
      detail: { status: 'SUSPENDED' },
    })
    expect(JSON.stringify(suspended)).not.toContain('Spam, three times')

    // The table refuses every write: the ban goes through all the same.
    const refusing = new Proxy(db, {
      get(target, property) {
        if (property === 'auditEvent') {
          return { create: () => Promise.reject(new Error('the audit table is unavailable')) }
        }
        const value: unknown = Reflect.get(target, property)
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value
      },
    })
    const banned = await (await asTheAdmin(admin, refusing)).admin.ban({ userId: member.id })
    expect(banned.bannedAt).not.toBeNull()
    expect((await eventsAbout(member.id)).map((row) => row.event)).toEqual(['admin.user_status'])
  })

  it('opens the Events screen to whoever holds events.read, and 404s everyone else', async () => {
    const reader = await person('reader')
    await db.user.update({ where: { id: reader.id }, data: { role: 'SUB_ADMIN' } })
    await db.subAdminGrant.create({
      data: { userId: reader.id, capability: 'events.read', grantedById: reader.id },
    })
    const user = await person('nosy')
    await expect((await as(reader)).admin.events({})).resolves.toMatchObject({ unknown: null })
    for (const who of [user, null]) {
      await expect((await as(who)).admin.events({})).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
    await db.subAdminGrant.deleteMany({ where: { userId: reader.id } })
  })
})
