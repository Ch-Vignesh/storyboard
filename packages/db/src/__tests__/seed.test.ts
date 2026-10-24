/**
 * Phase 14, item 9.5 — the seed reaches a database seeded before it grew, and a
 * second run changes nothing (FR-15.6).
 *
 * Production was seeded once, in October 2026, with no rewrite left open and
 * nothing on The Yellow Wallpaper. The seed was idempotent by existence, so a
 * stuck point added to the library afterwards would never have reached it.
 * These tests seed a work of their own, grow it, and seed again: what was
 * added must arrive, once, and nothing already there may move.
 *
 * Whether the library itself obeys the rules a person would meet is
 * `scripts/seed-library.test.ts`; that needs no database. This one does, and
 * skips when DATABASE_URL is unset. CI always runs it.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureSeedAccounts, type SeedAccounts } from '../../prisma/seed/storyboards/accounts'
import { EXAMPLE_REQUESTS } from '../../prisma/seed/storyboards/example-storyboard'
import { seedExampleStoryboard } from '../../prisma/seed/storyboards/index'
import type { SeedRequest, SeedWork } from '../../prisma/seed/storyboards/library'
import { seedLibrary } from '../../prisma/seed/storyboards/seed-library'
import { createPrismaClient } from '../client'
import type { PrismaClient } from '../generated/prisma/client'

const databaseUrl = process.env.DATABASE_URL

const OPENING =
  'The ship had been arriving for eleven years and the harbourmaster had written it down every morning of them.'
const NEXT =
  'The harbourmaster before her had kept the same book.\n\nHe had not written the ship down once, which she had taken, at first, for carelessness.'

const QUESTION: SeedRequest = {
  kind: 'UNBLOCK',
  title: 'Does she believe in the ship?',
  section: 0,
  ask: 'I cannot decide whether she still believes the ship is coming or only believes in writing it down, and the answer changes every page after this one.',
}

describe.skipIf(!databaseUrl)('seeding a database that was seeded before (item 9.5)', () => {
  let db: PrismaClient
  let accounts: SeedAccounts
  const run = randomUUID().replaceAll('-', '').slice(0, 10)
  const made: string[] = []

  /** A work of this test's own, never the library's. */
  function work(suffix: string, grown: Partial<SeedWork>): SeedWork {
    const publicId = `seedtest${run}${suffix}`
    made.push(publicId)
    return {
      publicId,
      title: `The ship never lands ${suffix}`,
      logline:
        'A harbourmaster keeps a logbook for a ship that has been arriving for eleven years.',
      type: 'SHORT_STORY',
      genres: ['literary'],
      source: { author: 'Nobody', firstPublished: 1900, url: 'https://www.gutenberg.org/ebooks/1' },
      chapter: { title: 'One', sections: [OPENING] },
      requests: [QUESTION],
      ...grown,
    }
  }

  const storyOf = (publicId: string) =>
    db.storyboard.findUniqueOrThrow({
      where: { publicId },
      select: { id: true, publicFrom: true },
    })

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    accounts = await ensureSeedAccounts(db)
  })

  afterAll(async () => {
    // Through the one sanctioned hatch, in the order the purge uses (FR-2.6):
    // suggestions and revisions in one statement, because they point at each
    // other and the NFR-3 trigger refuses the UPDATE either order would cause.
    for (const publicId of made) {
      const story = await db.storyboard.findUnique({ where: { publicId }, select: { id: true } })
      if (!story) continue
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
        const sectionIds = (
          await tx.section.findMany({
            where: { chapter: { version: { storyboardId: story.id } } },
            select: { id: true },
          })
        ).map((section) => section.id)
        await tx.section.updateMany({
          where: { id: { in: sectionIds } },
          data: { currentRevisionId: null },
        })
        await tx.$executeRaw`
          WITH gone AS (
            DELETE FROM "Suggestion" AS s
            USING "ContributionRequest" AS r
            WHERE s."requestId" = r."id" AND r."sectionId" = ANY(${sectionIds})
          )
          DELETE FROM "Revision" WHERE "sectionId" = ANY(${sectionIds})`
        await tx.idea.deleteMany({ where: { request: { storyboardId: story.id } } })
        await tx.contributionRequest.deleteMany({ where: { storyboardId: story.id } })
        await tx.section.deleteMany({ where: { id: { in: sectionIds } } })
        await tx.chapter.deleteMany({ where: { version: { storyboardId: story.id } } })
        await tx.version.deleteMany({ where: { storyboardId: story.id } })
        await tx.credit.deleteMany({ where: { storyboardId: story.id } })
        await tx.storyboard.delete({ where: { id: story.id } })
      })
    }
    await db.$disconnect()
  })

  it('adds what a work gained, where it is missing, and nothing twice', async () => {
    const first = work('a', {})
    expect(await seedLibrary(db, accounts, [first])).toMatchObject({ created: 1, requests: 1 })

    const helpersBefore = {
      notifications: await db.notification.count({
        where: { userId: { in: [...accounts.helpers.values()] } },
      }),
      days: await db.activityDay.count({
        where: { userId: { in: [...accounts.helpers.values()] } },
      }),
    }

    // The same work, grown the way the library grew: a section at the end, a
    // rewrite on it with a suggestion waiting, an idea on the question, and a
    // request on a section that is already asked about.
    const grown: SeedWork = {
      ...first,
      chapter: { title: 'One', sections: [OPENING, NEXT] },
      requests: [
        {
          ...QUESTION,
          ideas: [{ by: 'example-helper-1', body: 'She believes in it on Sundays.' }],
        },
        {
          kind: 'REWRITE',
          title: 'The second entry is flat',
          section: 1,
          ask: 'It reports that he never wrote the ship down and does nothing with it.',
          preContext: 'Ruth keeps the harbour log and has inherited it from a man who left.',
          suggestions: [
            {
              by: 'example-helper-2',
              note: 'Kept the facts and moved the doubt to the end.',
              prose:
                'The harbourmaster before her had kept the same book.\n\nHe had not written the ship down once. She had taken that for carelessness, at first.',
            },
          ],
        },
        { ...QUESTION, title: 'A second question about the opening' },
      ],
    }

    const second = await seedLibrary(db, accounts, [grown])
    expect(second).toMatchObject({ created: 0, skipped: 1, extended: 1, requests: 1, help: 2 })
    // Never moved onto a passage its ask is not about.
    expect(second.unplaced).toEqual([`${grown.title}: A second question about the opening`])

    const story = await storyOf(grown.publicId)
    const sections = await db.section.findMany({
      where: { chapter: { version: { storyboardId: story.id } } },
      orderBy: { order: 'asc' },
      select: { id: true, order: true, wordCount: true, currentRevisionId: true },
    })
    expect(sections.map((section) => section.order)).toEqual([0, 1])
    // Two paragraphs, counted the way the application counts.
    const added = await db.revision.findUniqueOrThrow({
      where: { id: sections[1]?.currentRevisionId ?? '' },
      select: { contentJson: true, contentText: true, source: true },
    })
    expect(added.source).toBe('AUTHORED')
    expect(added.contentText).toBe(NEXT)
    expect((added.contentJson as { content: unknown[] }).content).toHaveLength(2)

    const requests = await db.contributionRequest.findMany({
      where: { storyboardId: story.id },
      select: { title: true, state: true, sectionId: true },
      orderBy: { title: 'asc' },
    })
    // FR-5.9 and item 1.12 — answered, as a person's answer would leave it.
    expect(requests).toEqual([
      { title: QUESTION.title, state: 'ANSWERED', sectionId: sections[0]?.id },
      { title: 'The second entry is flat', state: 'ANSWERED', sectionId: sections[1]?.id },
    ])

    const suggestion = await db.suggestion.findFirstOrThrow({
      where: { request: { storyboardId: story.id } },
      select: { state: true, contributorId: true, baseRevisionId: true, submittedAt: true },
    })
    expect(suggestion.state).toBe('SUBMITTED')
    expect(suggestion.contributorId).toBe(accounts.helpers.get('example-helper-2'))
    // FR-6.3, written against the head; decision 0007, readable by strangers.
    expect(suggestion.baseRevisionId).toBe(sections[1]?.currentRevisionId)
    expect(suggestion.submittedAt?.getTime()).toBeGreaterThanOrEqual(
      story.publicFrom?.getTime() ?? Infinity,
    )

    const ideas = await db.idea.findMany({
      where: { request: { storyboardId: story.id } },
      select: { authorId: true, parentId: true },
    })
    expect(ideas).toEqual([{ authorId: accounts.helpers.get('example-helper-1'), parentId: null }])

    // Nothing that would outlive the story when it goes.
    expect(
      await db.notification.count({ where: { userId: { in: [...accounts.helpers.values()] } } }),
    ).toBe(helpersBefore.notifications)
    expect(
      await db.activityDay.count({ where: { userId: { in: [...accounts.helpers.values()] } } }),
    ).toBe(helpersBefore.days)

    // FR-15.6 — and a second run changes nothing, down to `updatedAt`.
    const before = await fingerprint(db, story.id, accounts)
    expect(await seedLibrary(db, accounts, [grown])).toMatchObject({
      created: 0,
      skipped: 1,
      corrected: 0,
      extended: 0,
      requests: 0,
      help: 0,
    })
    expect(await fingerprint(db, story.id, accounts)).toEqual(before)
  })

  it('adds nothing to a seeded story that has been deleted', async () => {
    const first = work('b', {})
    await seedLibrary(db, accounts, [first])
    const story = await storyOf(first.publicId)
    await db.storyboard.update({
      where: { id: story.id },
      data: { deletedAt: new Date(), state: 'DELETED' },
    })
    const before = await fingerprint(db, story.id, accounts)

    const grown: SeedWork = {
      ...first,
      chapter: { title: 'One', sections: [`${OPENING} Corrected.`, NEXT] },
      requests: [
        {
          ...QUESTION,
          ideas: [{ by: 'example-helper-1', body: 'She believes in it on Sundays.' }],
        },
      ],
    }
    expect(await seedLibrary(db, accounts, [grown])).toMatchObject({
      skipped: 1,
      corrected: 0,
      extended: 0,
      requests: 0,
      help: 0,
    })
    expect(await fingerprint(db, story.id, accounts)).toEqual(before)
  })

  it('gives no help to a request that has closed since it was seeded', async () => {
    const first = work('c', {})
    await seedLibrary(db, accounts, [first])
    const story = await storyOf(first.publicId)
    // As the nightly close leaves it thirty days on (decision 0050).
    await db.contributionRequest.updateMany({
      where: { storyboardId: story.id },
      data: { state: 'CLOSED', closedAt: new Date() },
    })

    const helped: SeedWork = {
      ...first,
      requests: [
        {
          ...QUESTION,
          ideas: [{ by: 'example-helper-2', body: 'She stopped believing years ago.' }],
        },
      ],
    }
    expect(await seedLibrary(db, accounts, [helped])).toMatchObject({ requests: 0, help: 0 })
    expect(await db.idea.count({ where: { request: { storyboardId: story.id } } })).toBe(0)
  })

  it('gives The Yellow Wallpaper one stuck point of each kind, once', async () => {
    // Made if this database has never been seeded, brought up to date if it
    // was seeded before item 9.5, and left alone if it already has them.
    await seedExampleStoryboard(db, accounts)
    expect(await seedExampleStoryboard(db, accounts)).toBe('already present')

    const story = await db.storyboard.findUniqueOrThrow({
      where: { publicId: 'seedyellow1' },
      select: { id: true },
    })
    const requests = await db.contributionRequest.findMany({
      where: { storyboardId: story.id, title: { in: EXAMPLE_REQUESTS.map((r) => r.title) } },
      select: {
        kind: true,
        _count: { select: { suggestions: true, ideas: true } },
        section: { select: { wordCount: true, chapter: { select: { order: true } } } },
      },
    })
    expect(requests.map((request) => request.kind).sort()).toEqual([
      'CONTINUE',
      'REWRITE',
      'UNBLOCK',
    ])
    for (const request of requests) {
      // Help on every one: a newcomer sees what helping looks like (D-14).
      expect(request._count.suggestions + request._count.ideas).toBeGreaterThan(0)
      // The continuation stands on the empty chapter at the end (FR-5.2).
      if (request.kind === 'CONTINUE') expect(request.section.wordCount).toBe(0)
      else expect(request.section.chapter.order).toBe(0)
    }
  })
})

/** Everything about one seeded story that a run could change, `updatedAt` included. */
async function fingerprint(db: PrismaClient, storyboardId: string, accounts: SeedAccounts) {
  const where = { storyboardId }
  return {
    story: await db.storyboard.findUniqueOrThrow({ where: { id: storyboardId } }),
    sections: await db.section.findMany({
      where: { chapter: { version: where } },
      orderBy: { id: 'asc' },
    }),
    revisions: await db.revision.count({ where: { section: { chapter: { version: where } } } }),
    requests: await db.contributionRequest.findMany({ where, orderBy: { id: 'asc' } }),
    suggestions: await db.suggestion.findMany({
      where: { request: where },
      orderBy: { id: 'asc' },
    }),
    ideas: await db.idea.findMany({ where: { request: where }, orderBy: { id: 'asc' } }),
    accounts: await db.user.findMany({
      where: { id: { in: [accounts.platformId, ...accounts.helpers.values()] } },
      orderBy: { id: 'asc' },
      select: { id: true, username: true, displayName: true, bio: true, updatedAt: true },
    }),
  }
}
