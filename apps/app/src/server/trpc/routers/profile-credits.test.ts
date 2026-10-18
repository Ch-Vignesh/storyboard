/**
 * Phase 14, item 6.10 — credits say where (FR-9.2, FR-9.3): a credit leads to
 * the passage it is in, named by chapter and section as the reader counts
 * them; one whose passage has left the draft leads to the suggestion's own
 * page; an idea leads to its request; and both of a profile's lists page past
 * `PROFILE_LISTS`.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { PROFILE_LISTS } from '@/lib/schemas/constants'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('credits say where (item 6.10)', () => {
  let db: PrismaClient
  const people: string[] = []
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner = { id: '', username: '' }
  let writer = { id: '', username: '' }
  let storyboardId = ''
  let slug = ''
  let requestId = ''
  let requestPublicId = ''
  let revisionId = ''
  let gonePublicId = ''
  let ideaId = ''

  async function person(label: string) {
    const username = `cw-${label}-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

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

  /** Ten characters, unique within the run. */
  const tag = (prefix: string, index: number) =>
    `${prefix}${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))}${run}`.slice(
      0,
      10,
    )

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    writer = await person('writer')
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `cw${run}`,
        slug: `credits-${run}`,
        title: 'Where',
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
    // Two chapters; the credited passage is the second section of the second.
    await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 1, title: 'Two' },
      select: { id: true },
    })
    const first = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 0 },
      select: { id: true },
    })
    const second = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 1, wordCount: 0 },
      select: { id: true, lineageId: true },
    })
    const revision = await db.revision.create({
      data: {
        sectionId: second.id,
        contentJson: { type: 'doc', content: [] },
        contentText: 'Hers.',
        wordCount: 1,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: writer.id,
      },
      select: { id: true },
    })
    revisionId = revision.id
    const request = await db.contributionRequest.create({
      data: {
        publicId: `rq${run}`,
        storyboardId,
        sectionId: first.id,
        openedById: owner.id,
        kind: 'REWRITE',
        title: 'Where it reads',
        ask: 'Shorter.',
        minWords: 1,
        maxWords: 100,
        state: 'RESOLVED',
      },
      select: { id: true, publicId: true },
    })
    requestId = request.id
    requestPublicId = request.publicId
    const suggestion = async (publicId: string) =>
      db.suggestion.create({
        data: {
          publicId,
          requestId: request.id,
          contributorId: writer.id,
          baseRevisionId: revision.id,
          contentJson: { type: 'doc', content: [] },
          contentText: 'Hers.',
          state: 'ACCEPTED',
          submittedAt: new Date(),
          decidedAt: new Date(),
          decidedById: owner.id,
        },
        select: { id: true, publicId: true },
      })
    const kept = await suggestion(`sk${run}`)
    const gone = await suggestion(`sg${run}`)
    gonePublicId = gone.publicId
    const idea = await db.idea.create({
      data: {
        requestId: request.id,
        authorId: writer.id,
        body: 'What if the harbour was never empty, and she had the wrong harbour all along, from the first page onward?',
        markedHelpful: true,
      },
      select: { id: true },
    })
    ideaId = idea.id

    const start = Date.now() - 10 * 60 * 1000
    await db.credit.createMany({
      data: [
        // In the draft: chapter 2, section 2.
        {
          storyboardId,
          contributorId: writer.id,
          type: 'PROSE',
          sectionLineage: second.lineageId,
          revisionId: revision.id,
          suggestionId: kept.id,
          createdAt: new Date(start + 3000),
        },
        // A lineage no longer in the draft: the suggestion's page instead.
        {
          storyboardId,
          contributorId: writer.id,
          type: 'PROSE',
          sectionLineage: randomUUID(),
          suggestionId: gone.id,
          isLive: false,
          createdAt: new Date(start + 2000),
        },
        {
          storyboardId,
          contributorId: writer.id,
          type: 'IDEA',
          ideaId: idea.id,
          createdAt: new Date(start + 1000),
        },
      ],
    })
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboardId } } }
      await tx.credit.deleteMany({ where: { storyboardId } })
      await tx.idea.deleteMany({ where: { request: { storyboardId } } })
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

  it('leads accepted prose to its passage, counted as the reader counts', async () => {
    const visitor = await as(null)
    const profile = await visitor.profile.byUsername({ username: writer.username })
    const [inDraft, gone, idea] = profile.credits
    expect(inDraft?.where).toEqual({ path: `/s/${slug}/c/2/2`, chapterNumber: 2, sectionNumber: 2 })
    expect(gone?.where).toEqual({
      path: `/s/${slug}/help/${requestPublicId}/s/${gonePublicId}`,
      chapterNumber: null,
      sectionNumber: null,
    })
    expect(idea?.where).toEqual({
      path: `/s/${slug}/help/${requestPublicId}#idea-${ideaId}`,
      chapterNumber: null,
      sectionNumber: null,
    })

    // The story's own contributors page says the same (FR-9.2).
    const { credits } = await visitor.credit.forStoryboard({ storyboardId })
    const placed = credits.filter((credit) => credit.place !== null)
    expect(placed).toHaveLength(1)
    expect(placed[0]?.place).toEqual({
      chapter: 'Two',
      chapterNumber: 2,
      sectionNumber: 2,
      path: `/s/${slug}/c/2/2`,
    })
  })

  it('pages credits past PROFILE_LISTS, by a cursor of their own', async () => {
    const start = Date.now() - 60 * 60 * 1000
    await db.credit.createMany({
      data: Array.from({ length: PROFILE_LISTS.credits }, (_, index) => ({
        storyboardId,
        contributorId: writer.id,
        type: 'COAUTHOR' as const,
        createdAt: new Date(start + index * 1000),
      })),
    })
    const visitor = await as(null)
    const profile = await visitor.profile.byUsername({ username: writer.username })
    expect(profile.credits).toHaveLength(PROFILE_LISTS.credits)
    expect(profile.creditsCursor).toBe(profile.credits[PROFILE_LISTS.credits - 1]?.id)

    const older = await visitor.profile.credits({
      username: writer.username,
      cursor: profile.creditsCursor,
    })
    expect(older.items).toHaveLength(3)
    expect(older.nextCursor).toBeNull()
    expect(new Set([...profile.credits, ...older.items].map((credit) => credit.id)).size).toBe(
      PROFILE_LISTS.credits + 3,
    )
    // Somebody else's id pages nothing.
    const stray = await visitor.profile.credits({ username: writer.username, cursor: requestId })
    expect(stray.items[0]?.id).toBe(profile.credits[0]?.id)
  })

  it('pages passed work past PROFILE_LISTS, and only for those who may see it', async () => {
    const total = PROFILE_LISTS.passed + 1
    const start = Date.now() - 2 * 60 * 60 * 1000
    await db.suggestion.createMany({
      data: Array.from({ length: total }, (_, index) => ({
        publicId: tag('p', index),
        requestId,
        contributorId: writer.id,
        baseRevisionId: revisionId,
        contentJson: { type: 'doc', content: [] },
        contentText: 'No.',
        state: 'PASSED' as const,
        submittedAt: new Date(start + index * 1000),
        decidedAt: new Date(start + index * 1000),
        decidedById: owner.id,
      })),
    })

    const self = await as(writer)
    const mine = await self.profile.byUsername({ username: writer.username })
    expect(mine.passed).toHaveLength(PROFILE_LISTS.passed)
    expect(mine.passedCount).toBe(total)
    const older = await self.profile.passed({
      username: writer.username,
      cursor: mine.passedCursor,
    })
    expect(older.items).toHaveLength(1)
    expect(older.nextCursor).toBeNull()

    // FR-9.4 — a visitor sees nothing of them until the writer shows them.
    const visitor = await as(null)
    const theirs = await visitor.profile.byUsername({ username: writer.username })
    expect(theirs.passed).toEqual([])
    expect(theirs.passedCount).toBe(0)
    expect(
      (await visitor.profile.passed({ username: writer.username, cursor: mine.passedCursor }))
        .items,
    ).toEqual([])
    await db.user.update({ where: { id: writer.id }, data: { showPassedWork: true } })
    expect(
      (await visitor.profile.passed({ username: writer.username, cursor: mine.passedCursor }))
        .items,
    ).toHaveLength(1)
  })
})
