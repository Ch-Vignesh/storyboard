/**
 * FR-12.1, FR-6.10 (phase 14, item 6.9) — notifications you can work through:
 * a page at a time by cursor, read one by one, and every row saying who did
 * what and where, worked out when it is read.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { NOTIFICATION_PAGE } from '@/lib/schemas/constants'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('notifications you can work through (item 6.9)', () => {
  let db: PrismaClient
  const people: string[] = []
  let owner = { id: '', username: '' }
  let helper = { id: '', username: '' }
  let editor = { id: '', username: '' }
  let stranger = { id: '', username: '' }
  let storyboardId = ''
  let requestId = ''
  let suggestionPublicId = ''
  const strangerRows = NOTIFICATION_PAGE + 5

  async function person(label: string, displayName?: string) {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const username = `nt-${label}-${run}`
    const row = await db.user.create({
      data: {
        email: `${username}@example.test`,
        username,
        displayName,
        emailVerifiedAt: new Date(),
      },
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

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner', 'Maya')
    helper = await person('helper')
    editor = await person('editor', 'Soon Erased')
    stranger = await person('stranger')
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `nt${run}`,
        slug: `notify-${run}`,
        title: 'Notify',
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
    // The fourth chapter, so a row says "chapter 4".
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 3, title: 'Four' },
      select: { id: true },
    })

    /** A passage with a suggestion from the helper, passed on by `decidedById`. */
    async function passed(order: number, decidedById: string, tag: string) {
      const section = await db.section.create({
        data: { chapterId: chapter.id, lineageId: randomUUID(), order, wordCount: 0 },
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
          authorId: owner.id,
        },
        select: { id: true },
      })
      const request = await db.contributionRequest.create({
        data: {
          publicId: `r${tag}${run}`,
          storyboardId,
          sectionId: section.id,
          openedById: owner.id,
          kind: 'REWRITE',
          title: `Passage ${tag}`,
          ask: 'Shorter.',
          minWords: 1,
          maxWords: 100,
        },
        select: { id: true },
      })
      const suggestion = await db.suggestion.create({
        data: {
          publicId: `s${tag}${run}`,
          requestId: request.id,
          contributorId: helper.id,
          baseRevisionId: revision.id,
          contentJson: { type: 'doc', content: [] },
          contentText: 'Shorter.',
          state: 'PASSED',
          submittedAt: new Date(),
          decidedAt: new Date(),
          decidedById,
        },
        select: { id: true, publicId: true },
      })
      await db.notification.create({
        data: {
          userId: helper.id,
          type: 'SUGGESTION_PASSED',
          payload: { suggestionId: suggestion.id, requestId: request.id },
        },
      })
      return { requestId: request.id, suggestionPublicId: suggestion.publicId }
    }

    const first = await passed(0, owner.id, 'a')
    requestId = first.requestId
    suggestionPublicId = first.suggestionPublicId
    await passed(1, editor.id, 'b')
    // Erased since: the row still says what happened, by a former member.
    await db.user.update({
      where: { id: editor.id },
      data: { status: 'DELETED', displayName: null, username: null },
    })

    const start = Date.now() - (strangerRows + 2) * 1000
    await db.notification.createMany({
      data: [
        { userId: helper.id, type: 'REQUEST_REOPENED', payload: { requestId, byId: owner.id } },
        { userId: helper.id, type: 'WEEKLY_DIGEST', payload: {} },
        // A stranger with more rows than a page, one a second.
        ...Array.from({ length: strangerRows }, (_, index) => ({
          userId: stranger.id,
          type: 'REQUEST_QUIET_SEVEN_DAYS' as const,
          payload: {},
          createdAt: new Date(start + index * 1000),
        })),
      ],
    })
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboardId } } }
      await tx.suggestion.deleteMany({ where: { request: { storyboardId } } })
      await tx.contributionRequest.deleteMany({ where: { storyboardId } })
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { section: where } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboardId } } })
      await tx.version.deleteMany({ where: { storyboardId } })
      await tx.storyboard.deleteMany({ where: { id: storyboardId } })
      await tx.notification.deleteMany({ where: { userId: { in: people } } })
      await tx.activityDay.deleteMany({ where: { userId: { in: people } } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  it('says who acted and where, as FR-6.10 words it, and leads to the suggestion', async () => {
    const { items } = await (await as(helper)).notification.list({})
    const passed = items.find((row) => row.path?.endsWith(`/s/${suggestionPublicId}`))
    expect(passed?.sentence).toBe(
      'Maya went a different way on chapter 4. Your version is still on your profile.',
    )
    expect(passed?.title).toBe('Passage a')
  })

  it('calls an erased decider a former member', async () => {
    const { items } = await (await as(helper)).notification.list({})
    const sentences = items
      .filter((row) => row.type === 'SUGGESTION_PASSED')
      .map((row) => row.sentence)
    expect(sentences).toContain(
      'A former member went a different way on chapter 4. Your version is still on your profile.',
    )
  })

  it('words a reopening by where the reader’s own suggestion stands, and sends the digest to Browse', async () => {
    const { items } = await (await as(helper)).notification.list({})
    expect(items.find((row) => row.type === 'REQUEST_REOPENED')?.sentence).toBe(
      'Maya opened the passage in chapter 4 for help again. They went a different way on yours before; you can send another.',
    )
    expect(items.find((row) => row.type === 'WEEKLY_DIGEST')?.path).toBe('/browse')
  })

  it('pages by cursor, newest first, and a cursor that is not yours is no cursor', async () => {
    const call = await as(stranger)
    const first = await call.notification.list({})
    expect(first.items).toHaveLength(NOTIFICATION_PAGE)
    expect(first.nextCursor).toBe(first.items[NOTIFICATION_PAGE - 1]?.id)

    const second = await call.notification.list({ cursor: first.nextCursor })
    expect(second.items).toHaveLength(strangerRows - NOTIFICATION_PAGE)
    expect(second.nextCursor).toBeNull()

    const rows = [...first.items, ...second.items]
    expect(new Set(rows.map((row) => row.id)).size).toBe(strangerRows)
    const times = rows.map((row) => row.createdAt.getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))

    const theirs = (await (await as(helper)).notification.list({})).items[0]!.id
    expect((await call.notification.list({ cursor: theirs })).items[0]?.id).toBe(first.items[0]?.id)
  })

  it('marks only your own rows read', async () => {
    const call = await as(helper)
    const mine = (await call.notification.list({})).items.find(
      (row) => row.type === 'WEEKLY_DIGEST',
    )!
    const theirs = (await (await as(stranger)).notification.list({})).items[0]!
    const before = await call.notification.unreadCount()

    expect(await call.notification.markRead({ ids: [mine.id, theirs.id] })).toEqual({ marked: 1 })
    expect(await call.notification.unreadCount()).toBe(before - 1)
    const untouched = await db.notification.findUniqueOrThrow({
      where: { id: theirs.id },
      select: { readAt: true },
    })
    expect(untouched.readAt).toBeNull()
    // Read already: nothing more to mark.
    expect(await call.notification.markRead({ ids: [mine.id] })).toEqual({ marked: 0 })
  })
})
