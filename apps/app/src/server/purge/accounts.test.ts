/**
 * Deleting an account (OD-3's second half, decision 0024).
 *
 * The rule under test is the uncomfortable one: **the writing stays**. A person
 * asks to be erased and their storyboards, revisions and credits remain, shown
 * as "a former member". That is a deliberate answer to a real conflict — their
 * work is not only theirs, because other people have contributed to it and been
 * credited on it — and it is exactly the kind of rule that a later change could
 * quietly invert without anybody noticing until somebody's chapter was gone.
 *
 * So most of what is below asserts survival rather than destruction.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { ACCOUNT_DELETION_GRACE_DAYS } from '@/lib/schemas/constants'
import { nameOf } from '@/lib/people'
import type { Mail } from '@/server/mail/mailer'

import { purgeDeletedAccounts } from './accounts'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('purging a deleted account (decision 0024)', () => {
  let db: PrismaClient
  const made: string[] = []

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterEach(async () => {
    if (made.length === 0) return
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboard: { ownerId: { in: made } } } } }
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      await tx.credit.updateMany({
        where: { storyboard: { ownerId: { in: made } } },
        data: { revisionId: null },
      })
      await tx.revision.deleteMany({ where: { section: where } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboard: { ownerId: { in: made } } } } })
      await tx.version.deleteMany({ where: { storyboard: { ownerId: { in: made } } } })
      await tx.credit.deleteMany({ where: { storyboard: { ownerId: { in: made } } } })
      await tx.notification.deleteMany({ where: { userId: { in: made } } })
      await tx.notificationPreference.deleteMany({ where: { userId: { in: made } } })
      await tx.storyboard.deleteMany({ where: { ownerId: { in: made } } })
      await tx.user.deleteMany({ where: { id: { in: made } } })
    })
    made.length = 0
  })

  /** A person with a storyboard, one written section, and some personal data. */
  async function aPersonWhoHasWritten(label: string) {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const user = await db.user.create({
      data: {
        email: `del-${label}-${run}@example.test`,
        username: `del_${label}_${run}`,
        displayName: 'Someone Real',
        bio: 'A biography that identifies a person.',
        standingNote: 'A note naming the person, left by an administrator.',
        passwordHash: 'argon2-placeholder',
        emailVerifiedAt: new Date(),
      },
      select: { id: true, username: true },
    })
    made.push(user.id)

    const storyboard = await db.storyboard.create({
      data: {
        publicId: `dl${run}`,
        slug: `del-${label}-${run}`,
        title: `Deletion ${label}`,
        type: 'NOVEL',
        visibility: 'PUBLIC',
        ownerId: user.id,
      },
      select: { id: true },
    })
    const version = await db.version.create({
      data: { storyboardId: storyboard.id, name: 'Main draft', isMain: true, createdById: user.id },
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
    const revision = await db.revision.create({
      data: {
        sectionId: section.id,
        contentJson: { type: 'doc', content: [] },
        contentText: 'The harbour had been empty for a year.',
        wordCount: 7,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: user.id,
      },
      select: { id: true },
    })
    await db.section.update({ where: { id: section.id }, data: { currentRevisionId: revision.id } })

    await db.notification.create({
      data: { userId: user.id, type: 'SUGGESTION_RECEIVED', payload: { title: 'x' } },
    })
    await db.notificationPreference.create({
      data: { userId: user.id, type: 'SUGGESTION_RECEIVED', email: false },
    })

    return { user, storyboard, revision, section }
  }

  /** Ask for deletion, and backdate the request past the grace period. */
  async function askAndAge(userId: string, days = ACCOUNT_DELETION_GRACE_DAYS + 1) {
    await db.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    })
  }

  it('leaves an account alone until its grace period is up', async () => {
    const { user } = await aPersonWhoHasWritten('waiting')
    // Asked for yesterday, with seven days to run.
    await askAndAge(user.id, 1)

    const result = await purgeDeletedAccounts(db)
    expect(result.purged).toBe(0)

    const after = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { username: true, status: true },
    })
    expect(after.username).toBe(user.username)
    expect(after.status).toBe('ACTIVE')
  })

  it('erases every identifying column once it is', async () => {
    const { user } = await aPersonWhoHasWritten('erased')
    // Item 3.13 — a picture is the most identifying column of all.
    await db.userAvatar.create({
      data: { userId: user.id, bytes: Buffer.from('not really webp'), contentType: 'image/webp' },
    })
    await askAndAge(user.id)

    const result = await purgeDeletedAccounts(db)
    expect(result.purged).toBeGreaterThanOrEqual(1)
    expect(await db.userAvatar.findUnique({ where: { userId: user.id } })).toBeNull()

    const after = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        status: true,
        email: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        passwordHash: true,
        emailVerifiedAt: true,
        standingNote: true,
      },
    })

    expect(after.status).toBe('DELETED')
    expect(after.standingNote).toBeNull()
    expect(after.username).toBeNull()
    expect(after.displayName).toBeNull()
    expect(after.bio).toBeNull()
    expect(after.avatarUrl).toBeNull()
    // Nulling the password would be enough to stop a sign-in; it is also what
    // stops a stolen hash outliving the account.
    expect(after.passwordHash).toBeNull()
    expect(after.emailVerifiedAt).toBeNull()
    // Unique and non-null, so it gets a value — one that is not theirs and
    // cannot be delivered to.
    expect(after.email).not.toContain('example.test')
    expect(after.email).toContain('@deleted.invalid')
  })

  it('keeps the work, which is the whole decision', async () => {
    const { user, storyboard, revision, section } = await aPersonWhoHasWritten('kept')
    await askAndAge(user.id)
    await purgeDeletedAccounts(db)

    // The storyboard is still there and still owned by the anchor row.
    const board = await db.storyboard.findUniqueOrThrow({
      where: { id: storyboard.id },
      select: { ownerId: true, deletedAt: true },
    })
    expect(board.ownerId).toBe(user.id)
    expect(board.deletedAt).toBeNull()

    // The prose is untouched, and the section still points at it.
    const kept = await db.revision.findUniqueOrThrow({
      where: { id: revision.id },
      select: { contentText: true, authorId: true },
    })
    expect(kept.contentText).toBe('The harbour had been empty for a year.')
    expect(kept.authorId).toBe(user.id)

    const stillReadable = await db.section.findUniqueOrThrow({
      where: { id: section.id },
      select: { currentRevisionId: true },
    })
    expect(stillReadable.currentRevisionId).toBe(revision.id)
  })

  it('renders the anchor as a former member rather than as missing data', async () => {
    const { user } = await aPersonWhoHasWritten('named')
    await askAndAge(user.id)
    await purgeDeletedAccounts(db)

    const person = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { username: true, displayName: true, status: true },
    })
    expect(nameOf(person)).toBe('a former member')
  })

  it('takes the things that exist only to reach or describe them', async () => {
    const { user } = await aPersonWhoHasWritten('personal')
    await askAndAge(user.id)
    await purgeDeletedAccounts(db)

    expect(await db.notification.count({ where: { userId: user.id } })).toBe(0)
    expect(await db.notificationPreference.count({ where: { userId: user.id } })).toBe(0)
  })

  it('is idempotent: a second run finds nothing to do', async () => {
    const { user } = await aPersonWhoHasWritten('twice')
    await askAndAge(user.id)

    await purgeDeletedAccounts(db)
    const second = await purgeDeletedAccounts(db)

    // `considered` counts rows still holding a username, so an already-erased
    // account is not picked up again — which matters, because a second pass
    // would otherwise keep rewriting a tombstone every night forever.
    const mine = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { username: true },
    })
    expect(mine.username).toBeNull()
    expect(second.purged).toBe(0)
  })

  /**
   * Phase 12 audit. The purge took "has a username" to mean "not yet erased",
   * so somebody who asked to be deleted before choosing one was never erased:
   * address, password and name kept for ever. And an admin's power outlived
   * the person.
   */
  it('erases an account that never chose a username, and an admin’s power with it', async () => {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    // A sub-admin rather than the admin: the database allows one admin
    // (decision 0043), and this must not take the role from whoever has it.
    const user = await db.user.create({
      data: {
        email: `del-nameless-${run}@example.test`,
        displayName: 'Nobody Yet',
        passwordHash: 'argon2-placeholder',
        emailVerifiedAt: new Date(),
        isAdmin: true,
        role: 'SUB_ADMIN',
      },
      select: { id: true },
    })
    made.push(user.id)
    // A sub-admin's grants go with the role (decision 0043).
    await db.subAdminGrant.create({
      data: { userId: user.id, capability: 'flags.toggle', grantedById: user.id },
    })
    await askAndAge(user.id)

    await purgeDeletedAccounts(db)

    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.status).toBe('DELETED')
    expect(after.email).not.toContain('nameless')
    expect(after.passwordHash).toBeNull()
    expect(after.displayName).toBeNull()
    expect(after.isAdmin).toBe(false)
    expect(after.role).toBe('USER')
    expect(await db.subAdminGrant.count({ where: { userId: user.id } })).toBe(0)
  })

  it('tells the address it had that the account is gone, and then forgets it', async () => {
    const { user } = await aPersonWhoHasWritten('told')
    const before = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { email: true },
    })
    await askAndAge(user.id)

    // Phase 14, item 1.5. The last message goes to the real address, and the
    // row is tombstoned afterwards, so what the message says is true.
    const sent: Mail[] = []
    await purgeDeletedAccounts(db, new Date(), {
      send: async (mail) => {
        sent.push(mail)
      },
    })

    expect(sent.filter((mail) => mail.to === before.email)).toHaveLength(1)
    expect(sent.find((mail) => mail.to === before.email)?.subject).toMatch(/deleted/i)
    const after = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { email: true, status: true },
    })
    expect(after.status).toBe('DELETED')
    expect(after.email).toContain('@deleted.invalid')
  })

  it('retires the username for good (decision 0042)', async () => {
    const { user } = await aPersonWhoHasWritten('retired')
    await askAndAge(user.id)
    await purgeDeletedAccounts(db, new Date(), { send: async () => undefined })

    // Phase 14, item 1.6. The SHA-256 of the lower-cased name, so `/@name`,
    // printed in credit lines and exports for ever, cannot be taken by a
    // stranger. Accounts erased before this change left no record.
    const { createHash } = await import('node:crypto')
    const hash = createHash('sha256')
      .update((user.username ?? '').toLowerCase())
      .digest('hex')
    expect(await db.retiredUsername.findUnique({ where: { hash } })).not.toBeNull()
    await db.retiredUsername.delete({ where: { hash } })
  })

  it('ignores an account that never asked', async () => {
    const { user } = await aPersonWhoHasWritten('innocent')

    await purgeDeletedAccounts(db)

    const after = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { username: true, status: true },
    })
    expect(after.username).toBe(user.username)
    expect(after.status).toBe('ACTIVE')
  })
})
