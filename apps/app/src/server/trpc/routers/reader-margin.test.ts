/**
 * Phase 14, items 7.1 to 7.3 — what the reader's margin is built from: the
 * open requests with the start of their ask (7.1), a request's passage
 * counted as the reader counts it (7.2), and the contributors strip, most
 * recent first and capped at `CONTRIBUTORS_STRIP_MAX` (7.3).
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CONTRIBUTORS_STRIP_MAX, MARGIN_ASK_CHARS } from '@/lib/schemas/constants'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)("the reader's margin (items 7.1 to 7.3)", () => {
  let db: PrismaClient
  const people: string[] = []
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner = { id: '', username: '' }
  let storyboardId = ''
  let slug = ''
  let requestPublicId = ''
  const helpers: Array<{ id: string; username: string }> = []
  const LONG_ASK = Array.from({ length: 120 }, (_, index) => `word${String(index)}`).join(' ')

  async function person(label: string) {
    const username = `rm-${label}-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

  async function guest() {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)({
      db,
      session: null,
      account: null,
      headers: new Headers(),
    })
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `rm${run}`,
        slug: `margin-${run}`,
        title: 'Margin',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: owner.id,
      },
      select: { id: true, slug: true },
    })
    storyboardId = storyboard.id
    slug = storyboard.slug
    const version = await db.version.create({
      data: { storyboardId, name: 'Main draft', isMain: true, createdById: owner.id },
      select: { id: true },
    })
    // A removed first chapter: the request's chapter is stored second and
    // reads first, which is what the old breadcrumb got wrong.
    await db.chapter.create({
      data: {
        versionId: version.id,
        lineageId: randomUUID(),
        order: 0,
        title: 'Cut',
        deletedAt: new Date(),
      },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 1, title: 'Kept' },
      select: { id: true },
    })
    await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 0 },
    })
    const stuck = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 1, wordCount: 0 },
      select: { id: true, lineageId: true },
    })
    const request = await db.contributionRequest.create({
      data: {
        publicId: `rmq${run}`,
        storyboardId,
        sectionId: stuck.id,
        openedById: owner.id,
        kind: 'UNBLOCK',
        title: 'Stuck here',
        ask: LONG_ASK,
        minWords: 150,
        maxWords: 1000,
      },
      select: { publicId: true },
    })
    requestPublicId = request.publicId

    // Seven people with a credit each, a minute apart; the newest also has
    // an older one, and one credit came with a spin-off.
    for (let index = 0; index < 7; index += 1) helpers.push(await person(`h${String(index)}`))
    const start = Date.now() - 60 * 60 * 1000
    await db.credit.createMany({
      data: [
        ...helpers.map((helper, index) => ({
          storyboardId,
          contributorId: helper.id,
          type: 'PROSE' as const,
          sectionLineage: stuck.lineageId,
          createdAt: new Date(start + (index + 1) * 60_000),
        })),
        {
          storyboardId,
          contributorId: helpers[6]!.id,
          type: 'IDEA' as const,
          createdAt: new Date(start),
        },
      ],
    })
    // Any earlier credit stands in for the original's.
    const original = await db.credit.findFirstOrThrow({
      where: { storyboardId, contributorId: helpers[0]!.id },
      select: { id: true },
    })
    await db.credit.updateMany({
      where: { storyboardId, contributorId: helpers[5]!.id },
      data: { inheritedFromId: original.id },
    })
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboardId } } }
      await tx.credit.deleteMany({ where: { storyboardId } })
      await tx.contributionRequest.deleteMany({ where: { storyboardId } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboardId } } })
      await tx.version.deleteMany({ where: { storyboardId } })
      await tx.storyboard.deleteMany({ where: { id: storyboardId } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  it('gives each open request the start of its ask, cut at a word (7.1)', async () => {
    const [request] = await (await guest()).request.listForStoryboard({ storyboardId })
    expect(request?.title).toBe('Stuck here')
    expect(request?.ask.endsWith('…')).toBe(true)
    expect(request?.ask.length).toBeLessThanOrEqual(MARGIN_ASK_CHARS + 1)
    expect(LONG_ASK.startsWith(request!.ask.slice(0, -1))).toBe(true)
  })

  it("places a request's passage as the reader counts it (7.2)", async () => {
    const { place, request } = await (await guest()).request.get({ publicId: requestPublicId })
    // Stored second, read first: the removed chapter is not counted.
    expect(request.section.chapter.order).toBe(1)
    expect(place).toEqual({
      chapter: 'Kept',
      chapterNumber: 1,
      sectionNumber: 2,
      path: `/s/${slug}/c/1/2`,
    })
  })

  it('lists the most recent contributors, up to the cap, with their latest credit (7.3)', async () => {
    const strip = await (await guest()).credit.strip({ storyboardId })
    expect(strip.total).toBe(7)
    expect(strip.contributors).toHaveLength(CONTRIBUTORS_STRIP_MAX)
    // Newest first.
    expect(strip.contributors.map((entry) => entry.contributor?.username)).toEqual(
      [6, 5, 4, 3, 2].map((index) => helpers[index]!.username),
    )
    const [newest, inherited] = strip.contributors
    // Two credits: counted, and the latest is the prose one.
    expect(newest?.count).toBe(2)
    expect(newest?.latest.type).toBe('PROSE')
    expect(newest?.latest.place).toMatchObject({ chapterNumber: 1, sectionNumber: 2 })
    expect(inherited?.latest.inherited).toBe(true)
    expect(strip.contributors[2]?.latest.inherited).toBe(false)
  })
})
