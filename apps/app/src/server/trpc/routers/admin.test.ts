/**
 * Decision 0043 (phase 14, items 2b.2 and 2b.3) — sub-admins. The admin alone
 * makes one and sets their grants; a grant opens exactly its door; a
 * suspension closes them all; demotion takes the grants with it.
 *
 * The sub-admin's context is the real one (`createTRPCContext`, with the
 * session mocked), so what is tested is the grants as a request loads them.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, Prisma, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ACCOUNT_DELETION_GRACE_DAYS } from '@/lib/schemas/constants'
import type { Mail } from '@/server/mail/mailer'
import { retiredUsernameHash } from '@/server/retired-usernames'

let signedIn: { id: string; username: string } | null = null
const sent: Mail[] = []

vi.mock('@/server/mail/mailer', () => ({
  getMailer: () => ({
    send: async (mail: Mail) => {
      sent.push(mail)
    },
  }),
}))

vi.mock('@/auth', () => ({
  auth: async () =>
    signedIn
      ? { user: { id: signedIn.id, username: signedIn.username, onboarded: true }, expires: '' }
      : null,
}))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('sub-admins (decision 0043)', () => {
  let db: PrismaClient
  const people: string[] = []

  async function person(label: string, role: 'USER' | 'SUB_ADMIN' = 'USER') {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const username = `sa-${label}-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date(), role },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

  /** A caller whose account, role and grants are read from the database, as a request's are. */
  async function as(who: { id: string; username: string }) {
    signedIn = who
    const { createCallerFactory, createTRPCContext } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)(await createTRPCContext({ headers: new Headers() }))
  }

  /**
   * The admin, as a hand-built context: the database allows one admin, and
   * this must not take the role from whoever holds it here.
   */
  async function asTheAdmin(who: { id: string; username: string }) {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)({
      db,
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
    await db.subAdminGrant.deleteMany({ where: { userId: { in: people } } })
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('opens exactly the doors the admin granted, as a request loads them', async () => {
    const admin = await person('admin')
    const helper = await person('helper')
    const call = await asTheAdmin(admin)
    await call.admin.setRole({ userId: helper.id, role: 'SUB_ADMIN' })
    await call.admin.setGrants({ userId: helper.id, capabilities: ['flags.toggle'] })

    const sub = await as(helper)
    await expect(sub.admin.flags()).resolves.toBeDefined()
    await expect(sub.admin.suspended()).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // Granting is the admin's alone, whatever a sub-admin holds.
    await expect(
      sub.admin.setGrants({ userId: helper.id, capabilities: ['reports.decide'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(sub.admin.setRole({ userId: admin.id, role: 'USER' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('takes every door from a suspended sub-admin, and gives them back when lifted', async () => {
    const admin = await person('admin2')
    const helper = await person('helper2', 'SUB_ADMIN')
    await (
      await asTheAdmin(admin)
    ).admin.setGrants({ userId: helper.id, capabilities: ['flags.toggle'] })

    await db.user.update({
      where: { id: helper.id },
      data: { status: 'SUSPENDED', suspendedAt: new Date() },
    })
    await expect((await as(helper)).admin.flags()).rejects.toMatchObject({ code: 'NOT_FOUND' })

    await db.user.update({
      where: { id: helper.id },
      data: { status: 'ACTIVE', suspendedAt: null },
    })
    await expect((await as(helper)).admin.flags()).resolves.toBeDefined()
  })

  it('refuses a grant outside the list, and a grant to anyone but a sub-admin', async () => {
    const admin = await person('admin3')
    const user = await person('user3')
    const call = await asTheAdmin(admin)
    await expect(
      call.admin.setGrants({ userId: user.id, capabilities: ['flags.toggle'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    await call.admin.setRole({ userId: user.id, role: 'SUB_ADMIN' })
    await expect(
      // Not a grantable name: the input schema refuses it before anything is written.
      call.admin.setGrants({ userId: user.id, capabilities: ['roles.manage' as 'flags.toggle'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(await db.subAdminGrant.count({ where: { userId: user.id } })).toBe(0)
  })

  it('takes the grants with a demotion, and never changes the admin', async () => {
    const admin = await person('admin4')
    const helper = await person('helper4', 'SUB_ADMIN')
    const call = await asTheAdmin(admin)
    await call.admin.setGrants({
      userId: helper.id,
      capabilities: ['flags.toggle', 'seeds.manage'],
    })
    expect(await db.subAdminGrant.count({ where: { userId: helper.id } })).toBe(2)

    await call.admin.setRole({ userId: helper.id, role: 'USER' })
    expect(await db.subAdminGrant.count({ where: { userId: helper.id } })).toBe(0)
    await expect((await as(helper)).admin.flags()).rejects.toMatchObject({ code: 'NOT_FOUND' })

    // The admin's own role is the command line's; and there is only one, so
    // "the admin" and "yourself" are the same account.
    await expect(call.admin.setRole({ userId: admin.id, role: 'USER' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  /**
   * Item 2b.4 — the hour's visit is noted by the session read, at most once
   * an hour, and without touching `updatedAt`.
   */
  it('notes when an account was last here, at most once an hour', async () => {
    const who = await person('seen')
    const lastSeen = async () =>
      db.user.findUniqueOrThrow({
        where: { id: who.id },
        select: { lastSeenAt: true, updatedAt: true },
      })

    expect((await lastSeen()).lastSeenAt).toBeNull()
    await as(who)
    expect((await lastSeen()).lastSeenAt).not.toBeNull()

    // Ten minutes later nothing is written; two hours later it is, and the
    // account's own `updatedAt` is left alone either way.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000)
    await db.user.update({ where: { id: who.id }, data: { lastSeenAt: tenMinutesAgo } })
    const fresh = await lastSeen()
    await as(who)
    expect(await lastSeen()).toEqual(fresh)

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000)
    await db.user.update({ where: { id: who.id }, data: { lastSeenAt: twoHoursAgo } })
    const stale = await lastSeen()
    await as(who)
    const after = await lastSeen()
    expect(after.lastSeenAt?.getTime()).toBeGreaterThan(twoHoursAgo.getTime())
    expect(after.updatedAt).toEqual(stale.updatedAt)
  })

  /**
   * Item 2b.4 — every number of the overview against a known fixture. Inside
   * one repeatable-read transaction, so the other suites writing to this
   * database at the same time cannot move the counts between the two reads;
   * it is rolled back at the end.
   */
  it('counts real activity for the overview, leaving seeds and erased accounts out', async () => {
    class RolledBack extends Error {}
    const now = new Date()
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const { overviewCounts } = await import('@/server/admin-overview')

    const transaction = db.$transaction(
      async (tx) => {
        const before = await overviewCounts(tx, now)

        const member = (label: string, data: { status?: 'DELETED'; lastSeenAt?: Date }) =>
          tx.user.create({
            data: {
              email: `ov-${label}-${run}@example.test`,
              username: `ov-${label}-${run}`,
              emailVerifiedAt: now,
              ...data,
            },
            select: { id: true },
          })
        // Counted in all, new and seen; new but not seen; erased, so nowhere.
        const writer = await member('writer', { lastSeenAt: now })
        await member('quiet', { lastSeenAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000) })
        await member('erased', { status: 'DELETED' })

        const story = async (label: string, isSeed: boolean) => {
          const storyboard = await tx.storyboard.create({
            data: {
              publicId: `ov${label}${run}`,
              slug: `ov-${label}-${run}`,
              title: 'Overview',
              type: 'NOVEL',
              visibility: 'PUBLIC',
              ownerId: writer.id,
              isSeed,
            },
            select: { id: true },
          })
          const version = await tx.version.create({
            data: {
              storyboardId: storyboard.id,
              name: 'Main draft',
              isMain: true,
              createdById: writer.id,
            },
            select: { id: true },
          })
          const chapter = await tx.chapter.create({
            data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
            select: { id: true },
          })
          const section = await tx.section.create({
            data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 3 },
            select: { id: true },
          })
          const revision = await tx.revision.create({
            data: {
              sectionId: section.id,
              contentJson: { type: 'doc', content: [] },
              contentText: 'Three short words.',
              wordCount: 3,
              contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
              source: 'AUTHORED',
              authorId: writer.id,
            },
            select: { id: true },
          })
          const request = await tx.contributionRequest.create({
            data: {
              publicId: `ovr${label}${run}`,
              storyboardId: storyboard.id,
              sectionId: section.id,
              openedById: writer.id,
              kind: 'UNBLOCK',
              state: 'OPEN',
              title: 'Stuck',
              ask: 'Which way?',
            },
            select: { id: true },
          })
          return { requestId: request.id, revisionId: revision.id }
        }
        const real = await story('a', false)
        const seed = await story('b', true)

        const suggestion = (
          at: { requestId: string; revisionId: string },
          label: string,
          state: 'SUBMITTED' | 'ACCEPTED' | 'DRAFT',
        ) => ({
          publicId: `ovs${label}${run}`,
          requestId: at.requestId,
          contributorId: writer.id,
          baseRevisionId: at.revisionId,
          contentJson: { type: 'doc', content: [] },
          contentText: 'A suggestion.',
          state,
          submittedAt: state === 'DRAFT' ? null : now,
        })
        await tx.suggestion.createMany({
          data: [
            suggestion(real, 'a', 'SUBMITTED'),
            suggestion(real, 'b', 'ACCEPTED'),
            suggestion(real, 'c', 'DRAFT'),
            suggestion(seed, 'd', 'SUBMITTED'),
          ],
        })
        await tx.idea.createMany({
          data: [
            {
              requestId: real.requestId,
              authorId: writer.id,
              body: 'An idea.',
              markedHelpful: true,
            },
            { requestId: real.requestId, authorId: writer.id, body: 'Another.' },
            {
              requestId: seed.requestId,
              authorId: writer.id,
              body: 'Seeded.',
              markedHelpful: true,
            },
          ],
        })
        await tx.report.create({
          data: {
            reporterId: writer.id,
            targetType: 'USER',
            targetId: writer.id,
            category: 'SPAM',
          },
        })

        const after = await overviewCounts(tx, now)
        const grew = (read: (counts: typeof after) => number) => read(after) - read(before)
        expect(grew((counts) => counts.members.total)).toBe(2)
        expect(grew((counts) => counts.members.newRecent)).toBe(2)
        expect(grew((counts) => counts.members.newMonth)).toBe(2)
        expect(grew((counts) => counts.members.seenRecent)).toBe(1)
        expect(grew((counts) => counts.members.seenMonth)).toBe(1)
        expect(grew((counts) => counts.stories)).toBe(1)
        expect(grew((counts) => counts.openRequests)).toBe(1)
        expect(grew((counts) => counts.suggestions.sent)).toBe(2)
        expect(grew((counts) => counts.suggestions.accepted)).toBe(1)
        expect(grew((counts) => counts.ideasHelped)).toBe(1)
        expect(grew((counts) => counts.openReports)).toBe(1)
        throw new RolledBack('fixture rolled back')
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
    await expect(transaction).rejects.toBeInstanceOf(RolledBack)
  })

  /** Item 2b.5 — the People screen's lookup. */
  it('finds an account by username or address, and shows its grants to the admin alone', async () => {
    const admin = await person('admin6')
    const sub = await person('sub6', 'SUB_ADMIN')
    await db.subAdminGrant.create({
      data: { userId: sub.id, capability: 'accounts.suspend', grantedById: admin.id },
    })
    const call = await asTheAdmin(admin)

    const byName = await call.admin.findAccount({ query: `@${sub.username.toUpperCase()}` })
    expect(byName?.id).toBe(sub.id)
    expect(byName?.role).toBe('SUB_ADMIN')
    expect(byName?.grants).toEqual(['accounts.suspend'])
    expect(byName?.isYou).toBe(false)
    const byEmail = await call.admin.findAccount({ query: `${sub.username}@EXAMPLE.test` })
    expect(byEmail?.id).toBe(sub.id)
    expect(await call.admin.findAccount({ query: `nobody-${sub.username}` })).toBeNull()

    // A sub-admin with the capability sees the account, not the grants, and
    // is told which account is their own.
    const seen = await (await as(sub)).admin.findAccount({ query: sub.username })
    expect(seen?.grants).toBeNull()
    expect(seen?.isYou).toBe(true)
  })

  /** Item 2b.5 — suspend with a note; a ban is what a lift cannot undo. */
  it('suspends with a note, refuses to lift a ban as a suspension, and lifts it as a ban', async () => {
    const admin = await person('admin7')
    const who = await person('who7')
    const call = await asTheAdmin(admin)
    const row = () => db.user.findUniqueOrThrow({ where: { id: who.id } })

    await call.admin.setUserStatus({
      userId: who.id,
      status: 'SUSPENDED',
      note: 'Three reports in a day.',
    })
    expect(await row()).toMatchObject({
      status: 'SUSPENDED',
      suspendedById: admin.id,
      standingNote: 'Three reports in a day.',
      bannedAt: null,
    })

    await call.admin.ban({ userId: who.id, note: 'And then spam.' })
    const banned = await row()
    expect(banned.bannedAt).not.toBeNull()
    expect(banned.standingNote).toBe('And then spam.')
    await expect(
      call.admin.setUserStatus({ userId: who.id, status: 'ACTIVE' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/Lift the ban/u),
    })
    expect((await row()).status).toBe('SUSPENDED')

    await call.admin.unban({ userId: who.id })
    expect(await row()).toMatchObject({ status: 'ACTIVE', bannedAt: null, standingNote: null })
    await expect(call.admin.unban({ userId: who.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  /** Item 2b.5 — deletion by an administrator: frozen as a ban, told at the address. */
  it('deletes an account as the person could have, frozen as a ban, and tells the address', async () => {
    const admin = await person('admin8')
    const who = await person('who8')
    const call = await asTheAdmin(admin)
    sent.length = 0

    const { finishesAt } = await call.admin.deleteAccount({
      userId: who.id,
      note: 'Impersonation.',
    })
    const row = await db.user.findUniqueOrThrow({ where: { id: who.id } })
    expect(row.status).toBe('SUSPENDED')
    expect(row.bannedAt).not.toBeNull()
    expect(row.deletionRequestedAt).not.toBeNull()
    expect(finishesAt.getTime() - (row.deletionRequestedAt?.getTime() ?? 0)).toBe(
      ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
    )
    expect(sent.map((mail) => mail.to)).toEqual([`${who.username}@example.test`])
    expect(sent[0]?.subject).toMatch(/will be deleted on/u)
    expect(sent[0]?.text).toMatch(/write to/u)

    // The person cannot keep the account from the settings; the banner says so.
    const theirs = await as(who)
    await theirs.settings.cancelDeletion()
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: who.id } })).deletionRequestedAt,
    ).not.toBeNull()
    expect((await theirs.settings.deletionStatus())?.byAdmin).toBe(true)

    // Lifting the ban stops the deletion too.
    await call.admin.unban({ userId: who.id })
    expect(await db.user.findUniqueOrThrow({ where: { id: who.id } })).toMatchObject({
      status: 'ACTIVE',
      bannedAt: null,
      deletionRequestedAt: null,
    })
  })

  /** Item 2b.5 — who may act on whom, through the real procedures. */
  it('lets nobody act on themself, and only the admin on a sub-admin', async () => {
    const admin = await person('admin9')
    const sub = await person('sub9', 'SUB_ADMIN')
    const other = await person('other9', 'SUB_ADMIN')
    await db.subAdminGrant.createMany({
      data: (['accounts.suspend', 'accounts.delete'] as const).map((capability) => ({
        userId: sub.id,
        capability,
        grantedById: admin.id,
      })),
    })
    const call = await asTheAdmin(admin)
    await expect(
      call.admin.setUserStatus({ userId: admin.id, status: 'SUSPENDED' }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/your own account/u) })

    const asSub = await as(sub)
    for (const attempt of [
      () => asSub.admin.setUserStatus({ userId: other.id, status: 'SUSPENDED' }),
      () => asSub.admin.ban({ userId: other.id }),
      () => asSub.admin.deleteAccount({ userId: other.id }),
    ]) {
      await expect(attempt()).rejects.toMatchObject({
        message: expect.stringMatching(/Only the administrator/u),
      })
    }
    await expect(asSub.admin.deleteAccount({ userId: sub.id })).rejects.toMatchObject({
      message: expect.stringMatching(/your own account/u),
    })
    expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('ACTIVE')

    // The admin may act on a sub-admin, and a sub-admin may act on a member.
    await call.admin.setUserStatus({ userId: other.id, status: 'SUSPENDED' })
    expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('SUSPENDED')
    const member = await person('member9')
    await asSub.admin.ban({ userId: member.id, note: 'Spam.' })
    expect((await db.user.findUniqueOrThrow({ where: { id: member.id } })).bannedAt).not.toBeNull()
  })

  /** Item 2b.6 — a banned name is refused as a taken one, and the ban can be lifted. */
  it('bans a username nobody holds, refuses it as taken, and lifts the ban', async () => {
    const admin = await person('admin10')
    const call = await asTheAdmin(admin)
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const name = `banned-${run}`
    await call.admin.banName({ name: name.toUpperCase(), note: 'A slur in another language.' })
    expect(await call.admin.bannedNames()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name, note: 'A slur in another language.' }),
      ]),
    )

    // A newcomer at the username step is told what they are told of any taken name.
    const newcomer = await db.user.create({
      data: { email: `nc-${run}@example.test`, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    people.push(newcomer.id)
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    const theirs = createCallerFactory(appRouter)({
      db,
      session: { user: { id: newcomer.id, username: null, onboarded: false }, expires: '' },
      account: {
        status: 'ACTIVE',
        isAdmin: false,
        role: 'USER' as const,
        grants: [],
        deletionRequestedAt: null,
        username: null,
      },
      headers: new Headers(),
    })
    expect(await theirs.user.usernameAvailable({ username: name })).toMatchObject({
      available: false,
    })
    await expect(theirs.user.chooseUsername({ username: name })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/is taken/u),
    })

    // A held name is refused here: ban the account instead.
    await expect(call.admin.banName({ name: admin.username })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/Ban the account/u),
    })

    // A retired name (decision 0042) is already unavailable, and nothing says
    // why; nor can a retired name be lifted as a ban, or turned into one.
    const retired = `gone-${run}`
    await db.retiredUsername.create({
      data: { hash: retiredUsernameHash(retired), retiredAt: new Date() },
    })
    await expect(call.admin.banName({ name: retired })).rejects.toMatchObject({
      message: expect.stringMatching(/already unavailable/u),
    })
    await expect(call.admin.unbanName({ name: retired })).rejects.toMatchObject({
      message: expect.stringMatching(/not banned/u),
    })
    expect(
      await db.retiredUsername.findUnique({ where: { hash: retiredUsernameHash(retired) } }),
    ).toMatchObject({ reason: 'RETIRED', name: null })

    await call.admin.unbanName({ name })
    expect(await theirs.user.usernameAvailable({ username: name })).toMatchObject({
      available: true,
    })
    await db.retiredUsername.delete({ where: { hash: retiredUsernameHash(retired) } })
  })
})
