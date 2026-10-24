/**
 * Phase 14, item 8.3 (FR-2.3) — a section moves to another chapter of the
 * same draft, at a place, in one transaction: both chapters are renumbered,
 * the section keeps its lineage, and the last section of a chapter, a chapter
 * of another draft, and a stranger are refused.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('moving a section (item 8.3)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  const people: string[] = []
  let owner = { id: '', username: '' }
  let stranger = { id: '', username: '' }
  let storyboardId = ''
  const chapter: Record<'one' | 'two' | 'elsewhere', string> = { one: '', two: '', elsewhere: '' }
  const section: Record<string, { id: string; lineageId: string }> = {}

  async function person(label: string) {
    const username = `mv-${label}-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

  async function as(who: { id: string; username: string }) {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
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

  const order = async (chapterId: string) =>
    (
      await db.section.findMany({
        where: { chapterId, deletedAt: null, mergedIntoId: null },
        orderBy: { order: 'asc' },
        select: { id: true, order: true },
      })
    ).map((row) => [row.id, row.order])

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    stranger = await person('stranger')
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `mv${run}`,
        slug: `move-${run}`,
        title: 'Moves',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: owner.id,
      },
      select: { id: true },
    })
    storyboardId = storyboard.id
    const main = await db.version.create({
      data: { storyboardId, name: 'Main draft', isMain: true, createdById: owner.id },
      select: { id: true },
    })
    const other = await db.version.create({
      data: { storyboardId, name: 'Another', isMain: false, createdById: owner.id },
      select: { id: true },
    })
    for (const [key, versionId, order] of [
      ['one', main.id, 0],
      ['two', main.id, 1],
      ['elsewhere', other.id, 0],
    ] as const) {
      chapter[key] = (
        await db.chapter.create({
          data: { versionId, lineageId: randomUUID(), order, title: key },
          select: { id: true },
        })
      ).id
    }
    for (const [key, chapterKey, order] of [
      ['a', 'one', 0],
      ['b', 'one', 1],
      ['c', 'two', 0],
      ['x', 'elsewhere', 0],
    ] as const) {
      section[key] = await db.section.create({
        data: { chapterId: chapter[chapterKey], lineageId: randomUUID(), order, wordCount: 0 },
        select: { id: true, lineageId: true },
      })
    }
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      await tx.section.deleteMany({ where: { chapter: { version: { storyboardId } } } })
      await tx.chapter.deleteMany({ where: { version: { storyboardId } } })
      await tx.version.deleteMany({ where: { storyboardId } })
      await tx.storyboard.deleteMany({ where: { id: storyboardId } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  it('moves a section to the top of another chapter, renumbering both', async () => {
    const result = await (
      await as(owner)
    ).section.move({ sectionId: section.b!.id, toChapterId: chapter.two, position: 0 })
    expect(result).toEqual({ chapterId: chapter.two, position: 0 })
    expect(await order(chapter.one)).toEqual([[section.a!.id, 0]])
    expect(await order(chapter.two)).toEqual([
      [section.b!.id, 0],
      [section.c!.id, 1],
    ])
    const moved = await db.section.findUniqueOrThrow({
      where: { id: section.b!.id },
      select: { lineageId: true },
    })
    expect(moved.lineageId).toBe(section.b!.lineageId)
  })

  it('moves within a chapter, and a place past the end is the end', async () => {
    await (
      await as(owner)
    ).section.move({
      sectionId: section.b!.id,
      toChapterId: chapter.two,
      position: 9,
    })
    expect(await order(chapter.two)).toEqual([
      [section.c!.id, 0],
      [section.b!.id, 1],
    ])
  })

  it("refuses to take a chapter's last section", async () => {
    await expect(
      (await as(owner)).section.move({
        sectionId: section.a!.id,
        toChapterId: chapter.two,
        position: 0,
      }),
    ).rejects.toThrow(/keeps at least one section/u)
  })

  it('refuses a chapter of another draft', async () => {
    await expect(
      (await as(owner)).section.move({
        sectionId: section.c!.id,
        toChapterId: chapter.elsewhere,
        position: 0,
      }),
    ).rejects.toThrow(/same draft/u)
  })

  it('is the authors’ to do', async () => {
    await expect(
      (await as(stranger)).section.move({
        sectionId: section.c!.id,
        toChapterId: chapter.one,
        position: 0,
      }),
    ).rejects.toThrow()
    expect((await order(chapter.two)).map(([id]) => id)).toContain(section.c!.id)
  })
})
