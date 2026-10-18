import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { requestImpact, sectionsRequestImpact, storyboardRequestImpact } from './impact'

const databaseUrl = process.env.DATABASE_URL

/**
 * Phase 14, item 5.2 — what a removal, a join, a closing or a privacy switch
 * would do, counted before it is done: the same requests `close-requests.ts`
 * would close and the same people it would tell.
 */
describe.skipIf(!databaseUrl)('what closing requests would mean', () => {
  let db: PrismaClient

  async function person(label: string) {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    return db.user.create({
      data: {
        email: `im-${label}-${run}@example.test`,
        username: `im-${label}-${run}`,
        displayName: `Im ${label}`,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, username: true },
    })
  }

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    // The story and its people stay: a revision cannot be deleted (NFR-3),
    // and the database this runs against is thrown away.
    await db.$disconnect()
  })

  it('counts the open requests and names each person with a draft or a waiting suggestion once', async () => {
    const author = await person('author')
    const drafting = await person('drafting')
    const waiting = await person('waiting')
    const gone = await person('gone')
    const run = randomUUID().replaceAll('-', '').slice(0, 8)

    const storyboard = await db.storyboard.create({
      data: {
        publicId: `im${run}`,
        slug: `im-${run}`,
        title: 'Impact',
        type: 'NOVEL',
        ownerId: author.id,
      },
      select: { id: true },
    })
    const version = await db.version.create({
      data: {
        storyboardId: storyboard.id,
        name: 'Main draft',
        isMain: true,
        createdById: author.id,
      },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })

    // One open request per section (the schema's own rule), so three sections.
    async function sectionWithRevision(order: number) {
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
          authorId: author.id,
        },
        select: { id: true },
      })
      await db.section.update({
        where: { id: section.id },
        data: { currentRevisionId: revision.id },
      })
      return { id: section.id, revisionId: revision.id }
    }
    const first = await sectionWithRevision(0)
    const second = await sectionWithRevision(1)
    const third = await sectionWithRevision(2)

    const request = (sectionId: string, state: 'OPEN' | 'ANSWERED' | 'CLOSED') =>
      db.contributionRequest.create({
        data: {
          publicId: `rq${randomUUID().replaceAll('-', '').slice(0, 10)}`,
          storyboardId: storyboard.id,
          sectionId,
          kind: 'CONTINUE',
          title: 'What happens next',
          ask: 'The scene stalls after the letter arrives and nothing turns.',
          openedById: author.id,
          state,
        },
        select: { id: true },
      })
    const open = await request(first.id, 'OPEN')
    const answered = await request(second.id, 'ANSWERED')
    const closed = await request(third.id, 'CLOSED')

    const suggestion = (
      requestId: string,
      baseRevisionId: string,
      contributorId: string,
      state: 'DRAFT' | 'SUBMITTED' | 'WITHDRAWN',
    ) =>
      db.suggestion.create({
        data: {
          publicId: `sg${randomUUID().replaceAll('-', '').slice(0, 10)}`,
          requestId,
          contributorId,
          baseRevisionId,
          contentJson: { type: 'doc', content: [] },
          contentText: '',
          wordCount: 0,
          state,
        },
      })
    await suggestion(open.id, first.revisionId, drafting.id, 'DRAFT')
    await suggestion(answered.id, second.revisionId, waiting.id, 'SUBMITTED')
    // The same person on two requests is told once.
    await suggestion(answered.id, second.revisionId, drafting.id, 'DRAFT')
    // Withdrawn: not waiting on anything, not told.
    await suggestion(open.id, first.revisionId, gone.id, 'WITHDRAWN')
    // On a closed request: nothing to close, nobody to tell.
    await suggestion(closed.id, third.revisionId, gone.id, 'SUBMITTED')

    const names = (told: Array<{ username?: string | null } | null>) =>
      told.map((who) => who?.username ?? '').sort()

    const onBoth = await sectionsRequestImpact(db, [first.id, second.id])
    expect(onBoth.openRequests).toBe(2)
    expect(names(onBoth.told)).toEqual([drafting.username, waiting.username].sort())

    expect(await sectionsRequestImpact(db, [third.id])).toEqual({ openRequests: 0, told: [] })
    expect(await sectionsRequestImpact(db, [])).toEqual({ openRequests: 0, told: [] })

    const whole = await storyboardRequestImpact(db, storyboard.id)
    expect(whole.openRequests).toBe(2)
    expect(whole.told).toHaveLength(2)

    const one = await requestImpact(db, { id: open.id })
    expect(one.openRequests).toBe(1)
    expect(names(one.told)).toEqual([drafting.username])
  })
})
