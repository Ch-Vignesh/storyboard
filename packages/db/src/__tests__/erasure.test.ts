/**
 * Decision 0013 — a contributor may erase their record, and the revision stays.
 *
 * NFR-3 refuses every UPDATE on `Revision`. Erasure is the one exception, and
 * an exception to an invariant is only as good as its edges: these tests are
 * mostly about what the hatch still refuses.
 *
 * Needs a real Postgres with migrations applied, so it skips when DATABASE_URL
 * is unset. CI always runs them.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createPrismaClient } from '../client'
import type { PrismaClient } from '../generated/prisma/client'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('erasing a contribution record', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 10)
  let userId = ''
  let sectionId = ''

  /** A fresh revision to experiment on, so one test cannot spoil another. */
  async function makeRevision(): Promise<string> {
    const revision = await db.revision.create({
      data: {
        sectionId,
        contentJson: { type: 'doc', content: [] },
        contentText: 'the tide went out',
        wordCount: 4,
        contentHash: 'hash'.padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: userId,
      },
      select: { id: true },
    })
    return revision.id
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    const user = await db.user.create({
      data: {
        email: `erasure-${run}@example.test`,
        username: `era_${run}`,
        displayName: 'Erasure',
      },
      select: { id: true },
    })
    userId = user.id

    const storyboard = await db.storyboard.create({
      data: {
        publicId: `era${run}`,
        slug: `erasure-${run}`,
        title: 'Erasure',
        type: 'NOVEL',
        visibility: 'PRIVATE',
        ownerId: userId,
      },
      select: { id: true },
    })
    const version = await db.version.create({
      data: { storyboardId: storyboard.id, name: 'Main draft', isMain: true, createdById: userId },
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
  })

  afterAll(async () => {
    if (!userId) return
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      await tx.section.updateMany({ where: { id: sectionId }, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { sectionId } })
    })
    await db.storyboard.deleteMany({ where: { ownerId: userId } })
    await db.user.delete({ where: { id: userId } })
    await db.$disconnect()
  })

  it('refuses to unname a revision without the flag', async () => {
    const id = await makeRevision()
    await expect(db.revision.update({ where: { id }, data: { authorId: null } })).rejects.toThrow(
      /immutable/i,
    )
  })

  it('allows unnaming inside a transaction that opts in', async () => {
    const id = await makeRevision()
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.erase_authorship', 'on', true)`)
      await tx.revision.update({ where: { id }, data: { authorId: null } })
    })

    const after = await db.revision.findUniqueOrThrow({
      where: { id },
      select: { authorId: true, contentText: true, contentHash: true },
    })
    expect(after.authorId).toBeNull()
    // The prose and its proof are untouched: that is the whole point.
    expect(after.contentText).toBe('the tide went out')
    expect(after.contentHash).toBe('hash'.padEnd(64, '0'))
  })

  it('still refuses a content change, even with the flag set', async () => {
    const id = await makeRevision()
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`select set_config('storyboard.erase_authorship', 'on', true)`)
        await tx.revision.update({
          where: { id },
          data: { authorId: null, contentText: 'something else entirely' },
        })
      }),
    ).rejects.toThrow(/immutable/i)
  })

  it('still refuses a hash change, so erasure cannot launder the proof (FR-13.6)', async () => {
    const id = await makeRevision()
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`select set_config('storyboard.erase_authorship', 'on', true)`)
        await tx.revision.update({
          where: { id },
          data: { authorId: null, contentHash: 'forged'.padEnd(64, '0') },
        })
      }),
    ).rejects.toThrow(/immutable/i)
  })

  it('refuses to reassign authorship to somebody else', async () => {
    const id = await makeRevision()
    const other = await db.user.create({
      data: { email: `other-${run}@example.test`, username: `oth_${run}`, displayName: 'Other' },
      select: { id: true },
    })

    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`select set_config('storyboard.erase_authorship', 'on', true)`)
        await tx.revision.update({ where: { id }, data: { authorId: other.id } })
      }),
    ).rejects.toThrow(/immutable/i)

    await db.user.delete({ where: { id: other.id } })
  })

  it('does not leak the flag into the next transaction', async () => {
    const id = await makeRevision()
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.erase_authorship', 'on', true)`)
      await tx.revision.update({ where: { id }, data: { authorId: null } })
    })

    // `set_config(..., true)` is transaction-local, so the next write is refused.
    const second = await makeRevision()
    await expect(
      db.revision.update({ where: { id: second }, data: { authorId: null } }),
    ).rejects.toThrow(/immutable/i)
  })

  it('keeps the Credit row when the contributor is erased', async () => {
    const storyboard = await db.storyboard.findFirstOrThrow({
      where: { ownerId: userId },
      select: { id: true },
    })
    const credit = await db.credit.create({
      data: { storyboardId: storyboard.id, contributorId: userId, type: 'PROSE', isLive: true },
      select: { id: true },
    })

    await db.credit.update({
      where: { id: credit.id },
      data: { contributorId: null, erasedAt: new Date() },
    })

    const after = await db.credit.findUniqueOrThrow({
      where: { id: credit.id },
      select: { contributorId: true, erasedAt: true, isLive: true },
    })
    // The contribution is still counted; the person is gone (decision 0013).
    expect(after.contributorId).toBeNull()
    expect(after.erasedAt).not.toBeNull()
    expect(after.isLive).toBe(true)

    await db.credit.delete({ where: { id: credit.id } })
  })
})
