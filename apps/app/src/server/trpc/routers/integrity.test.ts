/**
 * The phase 12 audit's integrity findings, through the real routers: what
 * happens to requests, suggestions and sections when two things happen at once,
 * or when the thing being written to has gone.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { SUGGESTION_QUOTA } from '@/lib/schemas/constants'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

const prose = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

describe.skipIf(!databaseUrl)('integrity under concurrency (phase 12 audit)', () => {
  let db: PrismaClient
  const people: string[] = []
  let owner = { id: '', username: '' }
  let reader = { id: '', username: '' }
  let storyboardId = ''
  let chapterId = ''

  async function person(label: string) {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const username = `ig-${label}-${run}`
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
      session: {
        user: { id: who.id, username: who.username, onboarded: true },
        expires: '',
      },
      account: {
        status: 'ACTIVE',
        isAdmin: false,
        deletionRequestedAt: null,
        username: who.username,
      },
      headers: new Headers(),
    })
  }

  /** A section with one revision, in the shared chapter. */
  async function aSection(order: number, text = 'The harbour had been empty for a year.') {
    const section = await db.section.create({
      data: { chapterId, lineageId: randomUUID(), order, wordCount: 8 },
      select: { id: true },
    })
    const revision = await db.revision.create({
      data: {
        sectionId: section.id,
        contentJson: prose(text),
        contentText: text,
        wordCount: text.split(' ').length,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: owner.id,
      },
      select: { id: true },
    })
    await db.section.update({ where: { id: section.id }, data: { currentRevisionId: revision.id } })
    return { sectionId: section.id, revisionId: revision.id }
  }

  /** An open request on a new section, asking for one to a thousand words. */
  async function aRequest() {
    const { sectionId } = await aSection(100 + people.length + Math.floor(Math.random() * 1e6))
    const request = await db.contributionRequest.create({
      data: {
        publicId: randomUUID().replaceAll('-', '').slice(0, 10),
        storyboardId,
        sectionId,
        openedById: owner.id,
        kind: 'REWRITE',
        title: 'Make it land',
        ask: 'Shorter.',
        minWords: 1,
        maxWords: 1000,
      },
      select: { id: true },
    })
    return request.id
  }

  /** The reader's draft on a request, saved and ready to send. */
  async function aDraft(requestId: string) {
    const call = await as(reader)
    const draft = await call.suggestion.startDraft({ requestId })
    await call.suggestion.saveDraft({ suggestionId: draft.id, contentJson: prose('It was empty.') })
    return draft.id
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    reader = await person('reader')
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `ig${run}`,
        slug: `integrity-${run}`,
        title: 'Integrity',
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
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboardId } } }
      const sectionIds = (await tx.section.findMany({ where, select: { id: true } })).map(
        (s) => s.id,
      )
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      await tx.credit.deleteMany({ where: { storyboardId } })
      await tx.$executeRaw`
        WITH gone AS (
          DELETE FROM "Suggestion" AS s USING "ContributionRequest" AS r
          WHERE s."requestId" = r."id" AND r."storyboardId" = ${storyboardId}
        )
        DELETE FROM "Revision" WHERE "sectionId" = ANY(${sectionIds})`
      await tx.contributionRequest.deleteMany({ where: { storyboardId } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboardId } } })
      await tx.version.deleteMany({ where: { storyboardId } })
      await tx.storyboard.deleteMany({ where: { id: storyboardId } })
      await tx.notification.deleteMany({ where: { userId: { in: people } } })
      await tx.activityDay.deleteMany({ where: { userId: { in: people } } })
      await tx.rateLimitHit.deleteMany({ where: { key: { endsWith: reader.id } } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  // ── Requests ──────────────────────────────────────────────────────────────

  it('takes no suggestion on a closed request, and accepts nothing into one', async () => {
    const requestId = await aRequest()
    const suggestionId = await aDraft(requestId)
    await (await as(reader)).suggestion.submit({ suggestionId })
    await db.contributionRequest.update({ where: { id: requestId }, data: { state: 'CLOSED' } })

    await expect((await as(reader)).suggestion.startDraft({ requestId })).rejects.toThrow(/closed/u)
    await expect(
      (await as(owner)).suggestion.accept({ suggestionId, acknowledgedChange: true }),
    ).rejects.toThrow(/closed/u)
  })

  it('opens the request again when the last suggestion waiting is withdrawn', async () => {
    const requestId = await aRequest()
    const suggestionId = await aDraft(requestId)
    await (await as(reader)).suggestion.submit({ suggestionId })
    expect(
      (await db.contributionRequest.findUniqueOrThrow({ where: { id: requestId } })).state,
    ).toBe('ANSWERED')

    await (await as(reader)).suggestion.withdraw({ suggestionId })

    expect(
      (await db.contributionRequest.findUniqueOrThrow({ where: { id: requestId } })).state,
    ).toBe('OPEN')
  })

  // ── Suggestions ───────────────────────────────────────────────────────────

  it('holds the per-story quota when sends arrive together, and a refusal costs nothing', async () => {
    const { key } = await import('@/server/limits')
    const quota = SUGGESTION_QUOTA.contributor
    const drafts = []
    for (let index = 0; index < quota + 2; index += 1) drafts.push(await aDraft(await aRequest()))
    const call = await as(reader)

    await Promise.allSettled(drafts.map((suggestionId) => call.suggestion.submit({ suggestionId })))

    const waiting = await db.suggestion.count({
      where: { contributorId: reader.id, state: 'SUBMITTED', request: { storyboardId } },
    })
    expect(waiting).toBe(quota)

    // One more, refused for the quota, must not spend one of the day's sends.
    const spent = () => db.rateLimitHit.count({ where: { key: key.suggestionsSent(reader.id) } })
    const before = await spent()
    await expect(
      call.suggestion.submit({ suggestionId: await aDraft(await aRequest()) }),
    ).rejects.toThrow(/waiting on this story/u)
    expect(await spent()).toBe(before)
  })

  it('lets only one of an accept and a pass decide the same suggestion', async () => {
    await db.suggestion.updateMany({
      where: { contributorId: reader.id, state: 'SUBMITTED' },
      data: { state: 'WITHDRAWN' },
    })
    const suggestionId = await aDraft(await aRequest())
    await (await as(reader)).suggestion.submit({ suggestionId })
    const author = await as(owner)

    const results = await Promise.allSettled([
      author.suggestion.accept({ suggestionId, acknowledgedChange: true }),
      author.suggestion.pass({ suggestionId }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const after = await db.suggestion.findUniqueOrThrow({ where: { id: suggestionId } })
    const credits = await db.credit.count({ where: { suggestionId } })
    // Whichever won, the record agrees with itself.
    expect(credits).toBe(after.state === 'ACCEPTED' ? 1 : 0)
  })

  // ── Sections ──────────────────────────────────────────────────────────────

  it('joins a section into the one above once, however many times it is asked', async () => {
    const above = await aSection(10, 'Above.')
    const below = await aSection(11, 'Below.')
    const author = await as(owner)

    await Promise.allSettled([
      author.section.joinWithPrevious({ sectionId: below.sectionId }),
      author.section.joinWithPrevious({ sectionId: below.sectionId }),
    ])
    await expect(author.section.joinWithPrevious({ sectionId: below.sectionId })).rejects.toThrow(
      /no longer in this story/u,
    )

    const head = await db.section.findUniqueOrThrow({
      where: { id: above.sectionId },
      select: { currentRevision: { select: { contentText: true } } },
    })
    expect(head.currentRevision?.contentText.match(/Below\./gu)).toHaveLength(1)
  })

  it('takes no new text into a section that has been deleted', async () => {
    const gone = await aSection(20)
    await aSection(21)
    const author = await as(owner)
    await author.section.delete({ sectionId: gone.sectionId })

    await expect(
      author.section.commitRevision({
        sectionId: gone.sectionId,
        contentJson: prose('Written into nothing.'),
        baseRevisionId: gone.revisionId,
      }),
    ).rejects.toThrow(/no longer in this story/u)
  })

  it('lets only one of two saves from the same starting point become the text', async () => {
    const { sectionId, revisionId } = await aSection(30)
    const author = await as(owner)

    const results = await Promise.allSettled([
      author.section.commitRevision({
        sectionId,
        contentJson: prose('The first tab.'),
        baseRevisionId: revisionId,
      }),
      author.section.commitRevision({
        sectionId,
        contentJson: prose('The second tab.'),
        baseRevisionId: revisionId,
      }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    // The loser's revision was rolled back with it, not left hanging off the chain.
    expect(await db.revision.count({ where: { sectionId } })).toBe(2)
  })

  // Last, because it makes the shared story private.
  it('stops naming a story in a reader’s own lists once it is private to them', async () => {
    const call = await as(reader)
    expect((await call.suggestion.listMine()).length).toBeGreaterThan(0)

    await db.storyboard.update({
      where: { id: storyboardId },
      data: { visibility: 'PRIVATE', title: 'A new, private title' },
    })

    expect(await call.suggestion.listMine()).toEqual([])
    const news = await call.request.withNews()
    expect(JSON.stringify(news)).not.toContain('A new, private title')
  })
})
