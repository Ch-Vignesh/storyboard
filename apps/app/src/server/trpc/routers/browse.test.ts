/**
 * FR-11.3 (phase 14, item 9.1) — browse pages through everything: "Show
 * more" by cursor for requests and for stories, every page counting all that
 * the filters match, requests in the order they were opened.
 *
 * And a leak found on the way: a signed-in person's search replaced the
 * visibility filter's own `OR` with the search's, so a story hidden after a
 * report (item 2.7, decision 0045), and its requests, came back in browse for
 * anybody who typed its title.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let signedIn: { id: string; username: string } | null = null

vi.mock('@/auth', () => ({
  auth: async () =>
    signedIn
      ? { user: { id: signedIn.id, username: signedIn.username, onboarded: true }, expires: '' }
      : null,
}))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('browse, a page at a time (item 9.1)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  const people: string[] = []
  const stories: string[] = []
  let owner = { id: '', username: '' }
  let stranger = { id: '', username: '' }
  /** Every request made here, oldest opened first. */
  const opened: Array<{ id: string; openedAt: Date }> = []
  let reopenedId = ''
  let hiddenTitle = ''

  async function as(who: { id: string; username: string } | null) {
    signedIn = who
    const { createCallerFactory, createTRPCContext } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)(await createTRPCContext({ headers: new Headers() }))
  }

  /** A public story with one section per request it will carry. */
  async function story(title: string, options: { hidden?: boolean; createdAt?: Date } = {}) {
    const id = randomUUID().replaceAll('-', '').slice(0, 10)
    const row = await db.storyboard.create({
      data: {
        publicId: `br${id}`,
        slug: `br-${id}`,
        title,
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60 * 60_000),
        hiddenAt: options.hidden ? new Date() : null,
        hiddenReason: options.hidden ? 'SPAM' : null,
        ownerId: owner.id,
        ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      },
      select: { id: true },
    })
    stories.push(row.id)
    const version = await db.version.create({
      data: { storyboardId: row.id, name: 'Main draft', isMain: true, createdById: owner.id },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    return { id: row.id, chapterId: chapter.id }
  }

  async function request(
    on: { id: string; chapterId: string },
    order: number,
    times: { createdAt: Date; openedAt: Date },
  ) {
    const section = await db.section.create({
      data: { chapterId: on.chapterId, lineageId: randomUUID(), order, wordCount: 0 },
      select: { id: true },
    })
    return db.contributionRequest.create({
      data: {
        publicId: `brq${run}${String(order)}`,
        storyboardId: on.id,
        sectionId: section.id,
        openedById: owner.id,
        kind: 'CONTINUE',
        title: `Stuck point ${String(order)}`,
        ask: 'Where does the morning go after the ship fails to arrive?',
        ...times,
      },
      select: { id: true, openedAt: true },
    })
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    for (const label of ['owner', 'stranger']) {
      const username = `br-${label}-${run}`
      const row = await db.user.create({
        data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date() },
        select: { id: true },
      })
      people.push(row.id)
      if (label === 'owner') owner = { id: row.id, username }
      else stranger = { id: row.id, username }
    }

    // Five requests on one story, opened a day apart, two of them in the same
    // instant (the id has to break that tie), and one opened again today
    // after first being opened long ago.
    const base = Date.now() - 20 * 24 * 60 * 60_000
    const day = 24 * 60 * 60_000
    const at = [base, base + day, base + day, base + 3 * day, base + 4 * day]
    const pages = await story(`Paging ${run}`)
    for (const [index, time] of at.entries()) {
      const made = await request(pages, index, {
        createdAt: new Date(time),
        openedAt: new Date(time),
      })
      opened.push(made)
    }
    const reopened = await request(pages, 9, {
      createdAt: new Date(base - 10 * day),
      openedAt: new Date(),
    })
    reopenedId = reopened.id
    opened.push(reopened)
    opened.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime() || (a.id < b.id ? -1 : 1))

    // Two more stories under the same search, made at different times.
    await story(`Paging ${run} second`, { createdAt: new Date(base) })
    await story(`Paging ${run} third`, { createdAt: new Date(base + day) })

    hiddenTitle = `Hidden ${run}`
    const hidden = await story(hiddenTitle, { hidden: true })
    await request(hidden, 20, { createdAt: new Date(base), openedAt: new Date(base) })
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const inStories = { storyboardId: { in: stories } }
      await tx.contributionRequest.deleteMany({ where: inStories })
      await tx.section.deleteMany({ where: { chapter: { version: inStories } } })
      await tx.chapter.deleteMany({ where: { version: inStories } })
      await tx.version.deleteMany({ where: inStories })
      await tx.storyboard.deleteMany({ where: { id: { in: stories } } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  it('pages through every request, newest opened first, each exactly once, with an honest total', async () => {
    const call = await as(null)
    const seen: string[] = []
    let cursor: { at: Date; id: string } | null = null
    for (let page = 0; page < 10; page += 1) {
      const result = await call.browse.requests({ query: `Paging ${run}`, take: 2, cursor })
      expect(result.total).toBe(opened.length)
      seen.push(...result.requests.map((request) => request.id))
      cursor = result.nextCursor
      if (!cursor) break
    }
    expect(seen).toEqual([...opened].reverse().map((request) => request.id))
    // Opened again today: first, though it was first opened before all the others.
    expect(seen[0]).toBe(reopenedId)
  })

  it('pages the other way for "waiting longest", and filters age by when it was opened', async () => {
    const call = await as(stranger)
    const first = await call.browse.requests({
      query: `Paging ${run}`,
      sort: 'CLOSING_SOON',
      take: 3,
    })
    const second = await call.browse.requests({
      query: `Paging ${run}`,
      sort: 'CLOSING_SOON',
      take: 3,
      cursor: first.nextCursor,
    })
    expect([...first.requests, ...second.requests].map((request) => request.id)).toEqual(
      opened.map((request) => request.id),
    )
    expect(second.nextCursor).toBeNull()

    const thisWeek = await call.browse.requests({ query: `Paging ${run}`, age: 'WEEK' })
    expect(thisWeek.requests.map((request) => request.id)).toEqual([reopenedId])
    expect(thisWeek.total).toBe(1)
  })

  it('pages through stories too, newest first, with the total', async () => {
    const call = await as(null)
    const first = await call.browse.storyboards({ query: `Paging ${run}`, take: 2 })
    expect(first.total).toBe(3)
    expect(first.storyboards).toHaveLength(2)
    const rest = await call.browse.storyboards({
      query: `Paging ${run}`,
      take: 2,
      cursor: first.nextCursor,
    })
    expect(rest.storyboards).toHaveLength(1)
    expect(rest.nextCursor).toBeNull()
    const titles = [...first.storyboards, ...rest.storyboards].map((story) => story.title)
    expect(new Set(titles).size).toBe(3)
    // The newest made comes first, the oldest last.
    expect(titles[2]).toBe(`Paging ${run} second`)
  })

  it('does not find a hidden story, or its requests, by searching for its title', async () => {
    for (const who of [null, stranger]) {
      const call = await as(who)
      const stories = await call.browse.storyboards({ query: hiddenTitle })
      expect(stories.storyboards).toHaveLength(0)
      expect(stories.total).toBe(0)
      const requests = await call.browse.requests({ query: hiddenTitle })
      expect(requests.requests).toHaveLength(0)
      expect(requests.total).toBe(0)
    }
  })
})
