/**
 * Phase 14, item 8.14 (FR-8.6) — optional reasons on a restore: one of
 * FR-6.10's four chips or none, written with the restoring revision, and
 * shown in the history. Needs a real Postgres, so it skips when DATABASE_URL
 * is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

const prose = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

describe.skipIf(!databaseUrl)('a reason on a restore (item 8.14)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner = { id: '', username: '' }
  let storyboardId = ''
  let sectionId = ''
  let first = ''

  async function as(who: { id: string; username: string } | null) {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)({
      db,
      session: who
        ? { user: { id: who.id, username: who.username, onboarded: true }, expires: '' }
        : null,
      account: who
        ? {
            status: 'ACTIVE',
            isAdmin: false,
            role: 'USER' as const,
            grants: [],
            deletionRequestedAt: null,
            username: who.username,
          }
        : null,
      headers: new Headers(),
    })
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    const username = `rr-owner-${run}`
    const user = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    owner = { id: user.id, username }
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `rr${run}`,
        slug: `restore-reason-${run}`,
        title: 'Why it went back',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: owner.id,
      },
      select: { id: true },
    })
    storyboardId = storyboard.id
    const version = await db.version.create({
      data: { storyboardId, name: 'Main draft', isMain: true, createdById: owner.id },
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
    sectionId = section.id
    const revision = await db.revision.create({
      data: {
        sectionId,
        contentJson: prose('The harbour had been empty for a year.'),
        contentText: 'The harbour had been empty for a year.',
        wordCount: 8,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: owner.id,
      },
      select: { id: true },
    })
    first = revision.id
    await db.section.update({ where: { id: sectionId }, data: { currentRevisionId: first } })
    // A second version through the router, so there is one to go back from.
    await (
      await as(owner)
    ).section.commitRevision({
      sectionId,
      contentJson: prose('The harbour was never empty.'),
      baseRevisionId: first,
    })
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      await tx.section.updateMany({ where: { id: sectionId }, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { sectionId, restoredFromId: { not: null } } })
      await tx.revision.deleteMany({ where: { sectionId, parentId: { not: null } } })
      await tx.revision.deleteMany({ where: { sectionId } })
      await tx.storyboard.deleteMany({ where: { id: storyboardId } })
      await tx.user.deleteMany({ where: { id: owner.id } })
    })
    await db.$disconnect()
  })

  it('writes the chip with the restore, and the history shows it to anyone who reads it', async () => {
    const author = await as(owner)
    await author.section.restoreRevision({
      sectionId,
      revisionId: first,
      reason: 'SOLVED_ANOTHER_WAY',
    })
    const history = await (await as(null)).section.history({ sectionId })
    expect(history.revisions[0]).toMatchObject({
      source: 'RESTORED',
      restoreReason: 'SOLVED_ANOTHER_WAY',
    })
    // The versions before it carry none.
    expect(history.revisions.slice(1).map((revision) => revision.restoreReason)).toEqual([
      null,
      null,
    ])
  })

  it('asks for no reason at all', async () => {
    const author = await as(owner)
    const history = await author.section.history({ sectionId })
    const older = history.revisions.find((revision) => revision.source === 'AUTHORED')
    await author.section.restoreRevision({ sectionId, revisionId: older?.id ?? '' })
    const after = await author.section.history({ sectionId })
    expect(after.revisions[0]).toMatchObject({ source: 'RESTORED', restoreReason: null })
  })

  it('takes nothing but the four chips: there is no free text', async () => {
    const author = await as(owner)
    await expect(
      author.section.restoreRevision({
        sectionId,
        revisionId: first,
        // @ts-expect-error — not one of FR-6.10's chips.
        reason: 'Because I said so',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})
