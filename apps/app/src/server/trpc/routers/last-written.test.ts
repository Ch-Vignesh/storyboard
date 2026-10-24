/**
 * Phase 14, item 7.6 (FR-11.1, prototype) — "last written": the trigger in
 * `20261024010000_last_written` stamps a story whenever a revision is
 * inserted into any of its sections, never moves it back for a copy carrying
 * an older time, and the dashboard's "Stories you are writing" sorts by it
 * rather than by `updatedAt`, which settings move and writing never did.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('last written (item 7.6)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner = { id: '', username: '' }
  const stories: Array<{ id: string; sectionId: string }> = []

  async function story(label: string) {
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `lw${label}${run}`.slice(0, 12),
        slug: `last-written-${label}-${run}`,
        title: `Story ${label}`,
        type: 'NOVEL',
        visibility: 'PRIVATE',
        ownerId: owner.id,
      },
      select: { id: true },
    })
    const version = await db.version.create({
      data: {
        storyboardId: storyboard.id,
        name: 'Main draft',
        isMain: true,
        createdById: owner.id,
      },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 0 },
      select: { id: true },
    })
    const entry = { id: storyboard.id, sectionId: section.id }
    stories.push(entry)
    return entry
  }

  const write = (sectionId: string, createdAt: Date) =>
    db.revision.create({
      data: {
        sectionId,
        contentJson: { type: 'doc', content: [] },
        contentText: '',
        wordCount: 0,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: owner.id,
        createdAt,
      },
    })

  const lastWritten = async (id: string) =>
    (await db.storyboard.findUniqueOrThrow({ where: { id }, select: { lastWrittenAt: true } }))
      .lastWrittenAt

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    const username = `lw-owner-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    owner = { id: row.id, username }
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const ids = stories.map((entry) => entry.id)
      const where = { chapter: { version: { storyboardId: { in: ids } } } }
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { section: where } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboardId: { in: ids } } } })
      await tx.version.deleteMany({ where: { storyboardId: { in: ids } } })
      await tx.storyboard.deleteMany({ where: { id: { in: ids } } })
      await tx.user.deleteMany({ where: { id: owner.id } })
    })
    await db.$disconnect()
  })

  it('is stamped by a revision, and never moved back by an older one', async () => {
    const { id, sectionId } = await story('a')
    expect(await lastWritten(id)).toBeNull()

    const written = new Date('2026-09-09T10:00:00Z')
    await write(sectionId, written)
    expect(await lastWritten(id)).toEqual(written)

    // A copy keeps its original, older time (decision 0019): no change.
    await write(sectionId, new Date('2026-08-01T10:00:00Z'))
    expect(await lastWritten(id)).toEqual(written)

    const later = new Date('2026-10-01T10:00:00Z')
    await write(sectionId, later)
    expect(await lastWritten(id)).toEqual(later)
  })

  it('orders "Stories you are writing" by it, not by a settings change', async () => {
    const older = await story('b')
    const newer = await story('c')
    await write(older.sectionId, new Date('2026-09-01T10:00:00Z'))
    await write(newer.sectionId, new Date('2026-09-20T10:00:00Z'))
    // A settings change moves `updatedAt` on the older one.
    await db.storyboard.update({ where: { id: older.id }, data: { logline: 'Changed.' } })

    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    const mine = await createCallerFactory(appRouter)({
      db,
      session: { user: { id: owner.id, username: owner.username, onboarded: true }, expires: '' },
      account: {
        status: 'ACTIVE',
        isAdmin: false,
        role: 'USER' as const,
        grants: [],
        deletionRequestedAt: null,
        username: owner.username,
      },
      headers: new Headers(),
    }).storyboard.listMine()

    const order = mine.map((entry) => entry.id).filter((id) => id === older.id || id === newer.id)
    expect(order).toEqual([newer.id, older.id])
    expect(mine.find((entry) => entry.id === newer.id)?.lastWrittenAt).toEqual(
      new Date('2026-09-20T10:00:00Z'),
    )
  })
})
