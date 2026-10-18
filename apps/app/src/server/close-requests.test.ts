/**
 * FR-2.7 and FR-14.1 — closing a request tells the person answering it.
 *
 * Both halves of this were missing until phase 10, and the missing half was
 * the one nobody notices: the requests were closed correctly and in silence.
 * A contributor part-way through a suggestion found out by coming back to a
 * passage that was no longer there — and in the going-private case, to a
 * storyboard that answers 404 to anyone who is not an author, so the request,
 * the prose they were answering and the context all vanished together.
 *
 * The test is written against the database rather than the router because what
 * is being pinned is the rule, not the plumbing: close a request, and everybody
 * mid-answer hears about it exactly once.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('closing the open requests on a storyboard', () => {
  let db: PrismaClient
  const made: string[] = []

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterEach(async () => {
    if (made.length === 0) return
    const where = { chapter: { version: { storyboard: { ownerId: { in: made } } } } }
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      await tx.notification.deleteMany({ where: { userId: { in: made } } })
      await tx.suggestion.deleteMany({ where: { request: { section: where } } })
      await tx.contributionRequest.deleteMany({ where: { section: where } })
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { section: where } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboard: { ownerId: { in: made } } } } })
      await tx.version.deleteMany({ where: { storyboard: { ownerId: { in: made } } } })
      await tx.storyboard.deleteMany({ where: { ownerId: { in: made } } })
      await tx.user.deleteMany({ where: { id: { in: made } } })
    })
    made.length = 0
  })

  /** An author with one open request, and contributors at various stages. */
  async function aStoryboardBeingHelped(state: 'OPEN' | 'ANSWERED' = 'OPEN') {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)

    const person = async (label: string) => {
      const row = await db.user.create({
        data: { email: `cr-${label}-${run}@example.test`, username: `cr_${label}_${run}` },
        select: { id: true },
      })
      made.push(row.id)
      return row.id
    }

    const author = await person('author')
    const drafting = await person('drafting')
    const submitted = await person('submitted')
    const alreadyPassed = await person('passed')

    const storyboard = await db.storyboard.create({
      data: {
        publicId: `cr${run}`,
        slug: `close-${run}`,
        title: 'Closing',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(),
        ownerId: author,
      },
      select: { id: true },
    })
    const version = await db.version.create({
      data: { storyboardId: storyboard.id, name: 'Main draft', isMain: true, createdById: author },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 5 },
      select: { id: true },
    })
    const revision = await db.revision.create({
      data: {
        sectionId: section.id,
        contentJson: { type: 'doc', content: [] },
        contentText: 'The harbour was empty.',
        wordCount: 4,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: author,
      },
      select: { id: true },
    })
    await db.section.update({ where: { id: section.id }, data: { currentRevisionId: revision.id } })

    const request = await db.contributionRequest.create({
      data: {
        publicId: randomUUID().replaceAll('-', '').slice(0, 10),
        storyboardId: storyboard.id,
        sectionId: section.id,
        openedById: author,
        kind: 'REWRITE',
        title: 'This paragraph is flat',
        ask: 'Make it land.',
        state,
      },
      select: { id: true, sectionId: true },
    })

    const suggestion = async (contributorId: string, state: 'DRAFT' | 'SUBMITTED' | 'PASSED') => {
      await db.suggestion.create({
        data: {
          publicId: randomUUID().replaceAll('-', '').slice(0, 10),
          requestId: request.id,
          contributorId,
          baseRevisionId: revision.id,
          contentJson: { type: 'doc', content: [] },
          contentText: 'A proposal.',
          wordCount: 2,
          state,
        },
      })
    }
    await suggestion(drafting, 'DRAFT')
    await suggestion(submitted, 'SUBMITTED')
    await suggestion(alreadyPassed, 'PASSED')

    return { storyboard, request, author, drafting, submitted, alreadyPassed }
  }

  /** The production helper, reached the way the routers reach it. */
  async function close(storyboardId: string) {
    const { closeOpenRequests } = await import('./close-requests')
    return closeOpenRequests(db, storyboardId)
  }

  it('closes every open request', async () => {
    const { storyboard, request } = await aStoryboardBeingHelped()

    expect(await close(storyboard.id)).toBe(1)

    const after = await db.contributionRequest.findUniqueOrThrow({
      where: { id: request.id },
      select: { state: true, closedAt: true },
    })
    expect(after.state).toBe('CLOSED')
    expect(after.closedAt).not.toBeNull()
  })

  /**
   * Phase 12 audit. A request with a suggestion sent is ANSWERED, not OPEN,
   * and only OPEN ones were closed: the request with somebody waiting on it,
   * the one whose people most need telling, stayed open after the story went
   * private or was finished, and kept taking suggestions.
   */
  it('closes an answered request too, and tells the people waiting on it', async () => {
    const { storyboard, request, submitted } = await aStoryboardBeingHelped('ANSWERED')

    expect(await close(storyboard.id)).toBe(1)

    const after = await db.contributionRequest.findUniqueOrThrow({
      where: { id: request.id },
      select: { state: true },
    })
    expect(after.state).toBe('CLOSED')
    expect(
      await db.notification.count({ where: { userId: submitted, type: 'REQUEST_CLOSED' } }),
    ).toBe(1)
  })

  it('closes the requests on sections that have gone, and only those', async () => {
    const { closeRequestsOnSections } = await import('./close-requests')
    const gone = await aStoryboardBeingHelped('ANSWERED')
    const kept = await aStoryboardBeingHelped()

    expect(await closeRequestsOnSections(db, [gone.request.sectionId])).toBe(1)

    const states = await db.contributionRequest.findMany({
      where: { id: { in: [gone.request.id, kept.request.id] } },
      select: { id: true, state: true },
    })
    expect(states.find((row) => row.id === gone.request.id)?.state).toBe('CLOSED')
    expect(states.find((row) => row.id === kept.request.id)?.state).toBe('OPEN')
  })

  it('tells everybody with a suggestion still in flight', async () => {
    const { storyboard, drafting, submitted } = await aStoryboardBeingHelped()
    await close(storyboard.id)

    for (const [who, label] of [
      [drafting, 'someone part-way through a draft'],
      [submitted, 'someone waiting on a decision'],
    ] as const) {
      const notes = await db.notification.findMany({
        where: { userId: who, type: 'REQUEST_CLOSED' },
      })
      expect(notes, label).toHaveLength(1)
    }
  })

  it('does not tell somebody whose suggestion was already decided', async () => {
    // That conversation finished when they were passed on. A second message
    // about the same request is noise, and FR-6.10 works hard to make being
    // passed on feel survivable.
    const { storyboard, alreadyPassed } = await aStoryboardBeingHelped()
    await close(storyboard.id)

    expect(
      await db.notification.count({ where: { userId: alreadyPassed, type: 'REQUEST_CLOSED' } }),
    ).toBe(0)
  })

  it('does not tell the author about their own decision', async () => {
    const { storyboard, author } = await aStoryboardBeingHelped()
    await close(storyboard.id)

    expect(await db.notification.count({ where: { userId: author } })).toBe(0)
  })

  /**
   * FR-11.3 with D-8 (phase 14, item 6.15; decision 0050) — the nightly close
   * for requests past their thirty days.
   */
  it('closes a request open past REQUEST_OPEN_DAYS, tells its author once, and leaves the rest', async () => {
    const { closeStaleRequests } = await import('./close-requests')
    const { REQUEST_OPEN_DAYS } = await import('@/lib/schemas/constants')
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const stale = await aStoryboardBeingHelped('ANSWERED')
    await db.contributionRequest.update({
      where: { id: stale.request.id },
      data: { openedAt: daysAgo(REQUEST_OPEN_DAYS + 1) },
    })
    const fresh = await aStoryboardBeingHelped()
    await db.contributionRequest.update({
      where: { id: fresh.request.id },
      data: { openedAt: daysAgo(REQUEST_OPEN_DAYS - 1) },
    })
    const resolved = await aStoryboardBeingHelped()
    await db.contributionRequest.update({
      where: { id: resolved.request.id },
      data: {
        state: 'RESOLVED',
        resolvedAt: new Date(),
        openedAt: daysAgo(REQUEST_OPEN_DAYS + 10),
      },
    })

    expect(await closeStaleRequests(db)).toBe(1)
    const states = async () =>
      Promise.all(
        [stale, fresh, resolved].map(
          async ({ request }) =>
            (
              await db.contributionRequest.findUniqueOrThrow({
                where: { id: request.id },
                select: { state: true },
              })
            ).state,
        ),
      )
    expect(await states()).toEqual(['CLOSED', 'OPEN', 'RESOLVED'])
    // The people answering it are told as the author's own close tells them...
    expect(
      await db.notification.count({ where: { userId: stale.submitted, type: 'REQUEST_CLOSED' } }),
    ).toBe(1)
    // ...and the author once, by a kind of its own.
    const toldAuthor = () =>
      db.notification.count({ where: { userId: stale.author, type: 'REQUEST_AUTO_CLOSED' } })
    expect(await toldAuthor()).toBe(1)

    // Tomorrow's run finds nothing new, and says nothing again.
    expect(await closeStaleRequests(db)).toBe(0)
    expect(await toldAuthor()).toBe(1)
    expect(await states()).toEqual(['CLOSED', 'OPEN', 'RESOLVED'])
  })

  it('does nothing, and says so, when there is nothing open', async () => {
    const { storyboard } = await aStoryboardBeingHelped()
    await close(storyboard.id)

    // The second call is the one that matters: going private twice, or
    // finishing and re-finishing, must not send a second round of messages.
    expect(await close(storyboard.id)).toBe(0)
    expect(await db.notification.count({ where: { type: 'REQUEST_CLOSED' } })).toBeGreaterThan(0)
  })
})
