/**
 * FR-5.2, FR-6.9 — ideas only where ideas belong (phase 14, item 1.8). An
 * idea answers a "help me think" request. The server never checked the kind,
 * and refused only closed requests, so a request for prose took ideas, and a
 * resolved one took new openings after its author had been unstuck.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'

import { IDEA_EDIT_MINUTES } from '@/lib/schemas/constants'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

/** Twenty words or more (FR-6.9). */
const IDEA =
  'One option is that the harbour was never empty at all, and she has been looking at the wrong harbour since the first page.'

type RequestKind = 'REWRITE' | 'CONTINUE' | 'UNBLOCK'
type RequestState = 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'CLOSED'

describe.skipIf(!databaseUrl)('ideas only where ideas belong (FR-5.2, FR-6.9)', () => {
  let db: PrismaClient
  const people: string[] = []
  let owner = { id: '', username: '' }
  let reader = { id: '', username: '' }
  let storyboardId = ''
  let chapterId = ''

  async function person(label: string) {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const username = `id-${label}-${run}`
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

  async function aRequest(kind: RequestKind, state: RequestState = 'OPEN') {
    const section = await db.section.create({
      data: {
        chapterId,
        lineageId: randomUUID(),
        order: Math.floor(Math.random() * 1e6),
        wordCount: 0,
      },
      select: { id: true },
    })
    const request = await db.contributionRequest.create({
      data: {
        publicId: randomUUID().replaceAll('-', '').slice(0, 10),
        storyboardId,
        sectionId: section.id,
        openedById: owner.id,
        kind,
        state,
        title: 'Stuck here',
        ask: 'Which way should this go?',
      },
      select: { id: true },
    })
    return request.id
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    reader = await person('reader')
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `id${run}`,
        slug: `ideas-${run}`,
        title: 'Ideas',
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
    chapterId = (
      await db.chapter.create({
        data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
        select: { id: true },
      })
    ).id
  })

  afterAll(async () => {
    await db.credit.deleteMany({ where: { storyboardId } })
    await db.idea.deleteMany({ where: { request: { storyboardId } } })
    await db.contributionRequest.deleteMany({ where: { storyboardId } })
    await db.section.deleteMany({ where: { chapter: { version: { storyboardId } } } })
    await db.chapter.deleteMany({ where: { version: { storyboardId } } })
    await db.version.deleteMany({ where: { storyboardId } })
    await db.storyboard.deleteMany({ where: { id: storyboardId } })
    await db.notification.deleteMany({ where: { userId: { in: people } } })
    await db.activityDay.deleteMany({ where: { userId: { in: people } } })
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('takes no idea on a request that asks for prose', async () => {
    const call = await as(reader)
    for (const kind of ['REWRITE', 'CONTINUE'] as const) {
      const requestId = await aRequest(kind)
      await expect(call.idea.post({ requestId, body: IDEA })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    }
  })

  it('takes a new idea while open or answered, and only a reply once resolved', async () => {
    const call = await as(reader)
    const open = await aRequest('UNBLOCK', 'OPEN')
    await expect(call.idea.post({ requestId: open, body: IDEA })).resolves.toMatchObject({
      parentId: null,
    })
    const answered = await aRequest('UNBLOCK', 'ANSWERED')
    await expect(call.idea.post({ requestId: answered, body: IDEA })).resolves.toMatchObject({
      parentId: null,
    })

    const resolved = await aRequest('UNBLOCK', 'RESOLVED')
    const earlier = await db.idea.create({
      data: { requestId: resolved, authorId: reader.id, body: IDEA },
      select: { id: true },
    })
    await expect(call.idea.post({ requestId: resolved, body: IDEA })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    const author = await as(owner)
    await expect(
      author.idea.post({ requestId: resolved, body: IDEA, parentId: earlier.id }),
    ).resolves.toMatchObject({ parentId: earlier.id })
  })

  it('takes nothing on a closed request, not even a reply', async () => {
    const closed = await aRequest('UNBLOCK', 'CLOSED')
    const earlier = await db.idea.create({
      data: { requestId: closed, authorId: reader.id, body: IDEA },
      select: { id: true },
    })
    await expect(
      (await as(reader)).idea.post({ requestId: closed, body: IDEA }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await expect(
      (await as(owner)).idea.post({ requestId: closed, body: IDEA, parentId: earlier.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  /**
   * FR-6.9, FR-12.2 (phase 14, item 1.9) — a reply reaches the person it
   * answers. Replies told only the story's authors, so a helper never learned
   * that the author had answered them.
   */
  it('tells the writer of an idea when someone replies, and the authors as before', async () => {
    const other = await person('other')
    const requestId = await aRequest('UNBLOCK')
    const told = (userId: string, type: 'IDEA_RECEIVED' | 'IDEA_REPLY') =>
      db.notification.count({
        where: { userId, type, payload: { path: ['requestId'], equals: requestId } },
      })

    const idea = await (await as(reader)).idea.post({ requestId, body: IDEA })
    expect(await told(owner.id, 'IDEA_RECEIVED')).toBe(1)

    // The author answers: the helper hears, and the author is not told of their own reply.
    await (await as(owner)).idea.post({ requestId, body: IDEA, parentId: idea.id })
    expect(await told(reader.id, 'IDEA_REPLY')).toBe(1)
    expect(await told(owner.id, 'IDEA_RECEIVED')).toBe(1)

    // Another helper answers: the writer hears, the authors hear, the replier does not.
    await (await as(other)).idea.post({ requestId, body: IDEA, parentId: idea.id })
    expect(await told(reader.id, 'IDEA_REPLY')).toBe(2)
    expect(await told(owner.id, 'IDEA_RECEIVED')).toBe(2)
    expect(await told(other.id, 'IDEA_REPLY')).toBe(0)
    expect(await told(other.id, 'IDEA_RECEIVED')).toBe(0)

    // The writer answers under their own idea: nobody is told of their own words.
    await (await as(reader)).idea.post({ requestId, body: IDEA, parentId: idea.id })
    expect(await told(reader.id, 'IDEA_REPLY')).toBe(2)
    expect(await told(owner.id, 'IDEA_RECEIVED')).toBe(3)

    // The reply leads to the request, at the thread.
    const list = (await (await as(reader)).notification.list({})).items
    const reply = list.find((row) => row.type === 'IDEA_REPLY')
    expect(reply?.path).toMatch(new RegExp(`/help/[^/]+#idea-${idea.id}$`))
  })

  /**
   * FR-6.9, FR-9.1 — credit only for help from someone else (phase 14, item
   * 1.7; decision 0041). "This one helped" took a reply, and an idea by one
   * of the story's own authors, and credited them for it.
   */
  it('marks only a top-level idea from outside the story as the one that helped', async () => {
    const author = await as(owner)
    const helper = await as(reader)
    const requestId = await aRequest('UNBLOCK')
    const own = await author.idea.post({ requestId, body: IDEA })
    const outside = await helper.idea.post({ requestId, body: IDEA })
    const reply = await helper.idea.post({ requestId, body: IDEA, parentId: outside.id })

    for (const ideaId of [own.id, reply.id]) {
      await expect(author.idea.markHelpful({ ideaId })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
    }
    expect(await db.credit.count({ where: { ideaId: { in: [own.id, reply.id] } } })).toBe(0)
    await expect(author.idea.markHelpful({ ideaId: outside.id })).resolves.toMatchObject({
      markedHelpful: true,
    })
    expect(await db.credit.count({ where: { ideaId: outside.id } })).toBe(1)
  })

  // Phase 14, item 6.8 (FR-6.9; D-7) — an idea changes for a while, can be
  // removed by its writer, and a reply is one word up.
  it('lets its writer change an idea for a while, remove it, and takes a one-word reply', async () => {
    const requestId = await aRequest('UNBLOCK')
    const helper = await as(reader)
    const author = await as(owner)
    const idea = await helper.idea.post({ requestId, body: IDEA })
    // FR-9.3 with D-6 (item 6.13) — the helper's day is marked on the calendar.
    expect(await db.activityDay.count({ where: { userId: reader.id } })).toBeGreaterThan(0)

    await expect(author.idea.edit({ ideaId: idea.id, body: IDEA })).rejects.toThrow(/not yours/u)
    await helper.idea.edit({ ideaId: idea.id, body: `${IDEA} And one more thought.` })
    const changed = await db.idea.findUniqueOrThrow({
      where: { id: idea.id },
      select: { body: true, editedAt: true },
    })
    expect(changed.body).toContain('one more thought')
    expect(changed.editedAt).toBeInstanceOf(Date)

    // The page is told who may still change it, by the cutoff the edit uses.
    const { publicId } = await db.contributionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { publicId: true },
    })
    const changeable = async (who: typeof helper) =>
      (await who.request.get({ publicId })).ideas.find((row) => row.id === idea.id)?.canChange
    expect(await changeable(helper)).toBe(true)
    expect(await changeable(author)).toBe(false)

    // D-7 — a reply is one word up; an idea is still twenty.
    const reply = await author.idea.post({ requestId, body: 'Yes.', parentId: idea.id })
    expect(reply.parentId).toBe(idea.id)
    // An author's own words on their own story mark nothing (D-6).
    expect(await db.activityDay.count({ where: { userId: owner.id } })).toBe(0)
    await expect(helper.idea.post({ requestId, body: 'Too short for an idea.' })).rejects.toThrow()

    // Past the window it stays as it is.
    await db.idea.update({
      where: { id: idea.id },
      data: { createdAt: new Date(Date.now() - (IDEA_EDIT_MINUTES + 1) * 60 * 1000) },
    })
    await expect(helper.idea.edit({ ideaId: idea.id, body: IDEA })).rejects.toThrow(/minutes/u)
    expect(await changeable(helper)).toBe(false)

    // Removed by its writer: the row stays, marked, and the reply with it.
    await helper.idea.remove({ ideaId: idea.id })
    const removed = await db.idea.findUniqueOrThrow({
      where: { id: idea.id },
      select: { deletedAt: true },
    })
    expect(removed.deletedAt).toBeInstanceOf(Date)
    expect(await db.idea.count({ where: { parentId: idea.id } })).toBe(1)
    await expect(helper.idea.remove({ ideaId: idea.id })).rejects.toThrow()

    // The one that helped neither changes nor goes.
    const kept = await helper.idea.post({ requestId, body: IDEA })
    await author.idea.markHelpful({ ideaId: kept.id })
    await expect(helper.idea.edit({ ideaId: kept.id, body: IDEA })).rejects.toThrow(/helped/u)
    await expect(helper.idea.remove({ ideaId: kept.id })).rejects.toThrow(/helped/u)
  })
})
