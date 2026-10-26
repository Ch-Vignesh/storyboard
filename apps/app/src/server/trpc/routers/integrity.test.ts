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

import {
  CONTINUE_TARGET_MAX_WORDS,
  SUGGESTION_QUOTA,
  SUGGESTION_WORDS,
} from '@/lib/schemas/constants'

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
        role: 'USER' as const,
        grants: [],
        deletionRequestedAt: null,
        username: who.username,
      },
      headers: new Headers(),
    })
  }

  /** A section with one revision, in the shared chapter unless told otherwise. */
  async function aSection(
    order: number,
    text = 'The harbour had been empty for a year.',
    inChapter = chapterId,
  ) {
    const section = await db.section.create({
      data: { chapterId: inChapter, lineageId: randomUUID(), order, wordCount: 8 },
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
  async function aRequest(kind: 'REWRITE' | 'CONTINUE' | 'UNBLOCK' = 'REWRITE') {
    const { sectionId } = await aSection(100 + people.length + Math.floor(Math.random() * 1e6))
    const request = await db.contributionRequest.create({
      data: {
        publicId: randomUUID().replaceAll('-', '').slice(0, 10),
        storyboardId,
        sectionId,
        openedById: owner.id,
        kind,
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
      await tx.rateLimitHit.deleteMany({
        where: { OR: people.map((id) => ({ key: { endsWith: id } })) },
      })
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
    await expect((await as(owner)).suggestion.accept({ suggestionId })).rejects.toThrow(/closed/u)
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

  /** FR-5.7 says "under 150 words"; a section of exactly 150 took both kinds. */
  it('asks for what comes next only on a section under the bound', async () => {
    const { sectionId } = await aSection(90)
    await db.section.update({
      where: { id: sectionId },
      data: { wordCount: CONTINUE_TARGET_MAX_WORDS },
    })
    await expect(
      (await as(owner)).request.create({
        sectionId,
        kind: 'CONTINUE',
        title: 'What next',
        ask: 'She has just come back to the harbour, and I do not know what she finds there, or who is waiting for her.',
        preContext: 'The harbour had been empty for a year. '.repeat(15),
        minWords: SUGGESTION_WORDS.floor,
        maxWords: SUGGESTION_WORDS.floor,
      }),
    ).rejects.toThrow(/already has/u)
  })

  /** FR-12.2's "an idea arrived" was a type nothing sent (2026-10-16 spec review). */
  it('tells the author an idea arrived, and leads to it, but not of their own', async () => {
    const requestId = await aRequest('UNBLOCK')
    const idea =
      'Let her find the letter in the boat first, before anyone else does, and keep it from them until the very last chapter of the book.'
    await (await as(reader)).idea.post({ requestId, body: idea })
    await (await as(owner)).idea.post({ requestId, body: idea })

    const { publicId } = await db.contributionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { publicId: true },
    })
    const arrived = (await (await as(owner)).notification.list({})).items.filter(
      (row) => row.type === 'IDEA_RECEIVED' && row.path?.endsWith(`/help/${publicId}`),
    )
    expect(arrived).toHaveLength(1)
  })

  /**
   * FR-13.5. Reporting the same thing again spent one of the day's reports,
   * and two at once was a server fault (2026-10-16 spec review).
   */
  it('takes a report once, free the second time, and two at once as one', async () => {
    const { key } = await import('@/server/limits')
    const reporter = await person('reporter')
    const call = await as(reporter)
    const spent = () => db.rateLimitHit.count({ where: { key: key.reportsMade(reporter.id) } })
    const report = (targetType: 'STORYBOARD' | 'USER', targetId: string) =>
      call.report.create({ targetType, targetId, category: 'SPAM' })

    expect((await report('STORYBOARD', storyboardId)).status).toBe('filed')
    expect((await report('STORYBOARD', storyboardId)).status).toBe('duplicate')
    expect(await spent()).toBe(1)

    const together = await Promise.all([report('USER', owner.id), report('USER', owner.id)])
    expect(together.map((result) => result.status).sort()).toEqual(['duplicate', 'filed'])
    await db.report.deleteMany({ where: { reporterId: reporter.id } })
  })

  /**
   * A draft is not an answer. Every one counted until the 2026-10-16 spec
   * review: "1 suggestion" on a request nobody had sent anything to, gone
   * from browse's "No answers yet", and never nudged.
   */
  it('counts what was sent as an answer, and no draft', async () => {
    const requestId = await aRequest()
    await (await as(reader)).suggestion.startDraft({ requestId })
    const { publicId } = await db.contributionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { publicId: true },
    })

    const listed = await (await as(owner)).request.listForStoryboard({ storyboardId })
    expect(listed.find((request) => request.id === requestId)?._count.suggestions).toBe(0)

    const unanswered = await (
      await as(reader)
    ).browse.requests({ query: 'Integrity', sort: 'NO_ANSWERS', take: 50 })
    expect(JSON.stringify(unanswered)).toContain(publicId)
  })

  const closedTold = async (requestId: string, type: 'REQUEST_CLOSED' | 'REQUEST_REOPENED') =>
    (
      await db.notification.findMany({
        where: { type, payload: { path: ['requestId'], equals: requestId } },
        select: { userId: true },
      })
    ).map((row) => row.userId)

  /**
   * FR-5.10. Closing by hand told nobody, and what was waiting stayed
   * "waiting" for good, holding its writer's place in the per-story quota
   * (2026-10-16 spec review).
   */
  it('tells everyone answering when a request is closed by hand, and frees their place', async () => {
    const quota = SUGGESTION_QUOTA.contributor
    const writer = await person('closed-on')
    const call = await as(writer)
    const send = async (requestId: string) => {
      const draft = await call.suggestion.startDraft({ requestId })
      await call.suggestion.saveDraft({ suggestionId: draft.id, contentJson: prose('Shorter.') })
      await call.suggestion.submit({ suggestionId: draft.id })
    }
    const closing = await aRequest()
    await send(closing)
    for (let index = 1; index < quota; index += 1) await send(await aRequest())
    const drafter = await person('drafting')
    await (await as(drafter)).suggestion.startDraft({ requestId: closing })

    await (await as(owner)).request.close({ requestId: closing })

    expect(new Set(await closedTold(closing, 'REQUEST_CLOSED'))).toEqual(
      new Set([writer.id, drafter.id]),
    )
    // The one on the closed request no longer counts: a full quota has room.
    await expect(send(await aRequest())).resolves.toBeUndefined()
  })

  /**
   * FR-5.9: everyone who ever sent something is told it is open again. They
   * were sent "the section you helped with changed", drafts included, and a
   * second click told them twice (2026-10-16 spec review).
   */
  it('tells the people who sent something, once, when a request is opened again', async () => {
    const requestId = await aRequest()
    const sent = await aSentSuggestion(requestId, 'reopen-sent', 'Sent.')
    const drafter = await person('reopen-draft')
    await (await as(drafter)).suggestion.startDraft({ requestId })
    const author = await as(owner)
    await author.request.close({ requestId })

    await Promise.allSettled([
      author.request.reopen({ requestId }),
      author.request.reopen({ requestId }),
    ])

    expect(await closedTold(requestId, 'REQUEST_REOPENED')).toEqual([sent.writer.id])
    expect(
      (await db.contributionRequest.findUniqueOrThrow({ where: { id: requestId } })).state,
    ).toBe('ANSWERED')
  })

  /**
   * FR-14.1. Finishing a story closed its requests, and nothing stopped one
   * being reopened, a new one opened, or a stale suggestion re-sent, and so
   * listed in browse again (2026-10-16 spec review).
   */
  it('opens nothing on a finished story, and browse lists none of its requests', async () => {
    const requestId = await aRequest()
    const { sectionId } = await aSection(70)
    const author = await as(owner)
    await author.request.close({ requestId })
    const { publicId } = await db.contributionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { publicId: true },
    })

    await db.storyboard.update({ where: { id: storyboardId }, data: { state: 'FINISHED' } })
    try {
      await expect(author.request.reopen({ requestId })).rejects.toThrow(/marked finished/u)
      await expect(
        author.request.create({
          sectionId,
          kind: 'UNBLOCK',
          title: 'Stuck',
          ask: 'I do not know what she does next, and every version I write of it reads like somebody else wrote it.',
          minWords: SUGGESTION_WORDS.floor,
          maxWords: SUGGESTION_WORDS.floor,
        }),
      ).rejects.toThrow(/marked finished/u)

      // And were one open anyway, browse would not offer it.
      await db.contributionRequest.update({ where: { id: requestId }, data: { state: 'OPEN' } })
      const listed = await (await as(reader)).browse.requests({ query: 'Integrity' })
      expect(JSON.stringify(listed)).not.toContain(publicId)
    } finally {
      await db.contributionRequest.update({ where: { id: requestId }, data: { state: 'CLOSED' } })
      await db.storyboard.update({ where: { id: storyboardId }, data: { state: 'ACTIVE' } })
    }
  })

  // ── Suggestions ───────────────────────────────────────────────────────────

  it('holds the per-story quota when sends arrive together, and a refusal costs nothing', async () => {
    const { key } = await import('@/server/limits')
    const quota = SUGGESTION_QUOTA.contributor
    const drafts = []
    for (let index = 0; index < quota + 2; index += 1) drafts.push(await aDraft(await aRequest()))
    const call = await as(reader)

    await Promise.allSettled(drafts.map((suggestionId) => call.suggestion.submit({ suggestionId })))

    // On open requests: one on a request closed without accepting holds no
    // place (FR-5.10), and the first test here left one.
    const waiting = await db.suggestion.count({
      where: {
        contributorId: reader.id,
        state: 'SUBMITTED',
        request: { storyboardId, state: { in: ['OPEN', 'ANSWERED'] } },
      },
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
      author.suggestion.accept({ suggestionId }),
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

  /**
   * 2026-10-16 spec review. A draft was judged out of date by its time, so
   * one typed on after a "changed a moment ago" refusal was newer than the
   * head, opened over it on reload, and replaced it on the next save.
   */
  it('keeps a draft typed after a refused save beside the text, not over it', async () => {
    const { sectionId, revisionId } = await aSection(35)
    const author = await as(owner)

    // Another tab saves first; this one's save is refused and it types on.
    const other = await author.section.commitRevision({
      sectionId,
      contentJson: prose('The other tab got there first.'),
      baseRevisionId: revisionId,
    })
    await expect(
      author.section.commitRevision({
        sectionId,
        contentJson: prose('This tab was refused.'),
        baseRevisionId: revisionId,
      }),
    ).rejects.toThrow(/changed a moment ago/)
    await author.section.saveDraft({
      sectionId,
      contentJson: prose('This tab was refused, and typed on.'),
      baseRevisionId: revisionId,
    })
    expect((await author.section.get({ sectionId })).draft?.behind).toBe(true)

    // Written on the text as it is, the same draft is simply the one to pick up.
    await author.section.saveDraft({
      sectionId,
      contentJson: prose('This tab caught up.'),
      baseRevisionId: other.revisionId,
    })
    expect((await author.section.get({ sectionId })).draft?.behind).toBe(false)

    // An overtaken draft that says only what the text says is no draft at all.
    await author.section.saveDraft({
      sectionId,
      contentJson: prose('The other tab got there first.'),
      baseRevisionId: revisionId,
    })
    expect((await author.section.get({ sectionId })).draft).toBeNull()
  })

  /**
   * Decision 0038. Found by the owner on 2026-10-16: accepting a "what comes
   * next" suggestion replaced the section, so the author's opening was gone
   * and only the continuation was left. And the comparison shown before
   * accepting had the author's words struck through, as if that were meant.
   */
  it('adds an accepted continuation after the text, and shows it that way first', async () => {
    await db.suggestion.updateMany({
      where: { contributorId: reader.id, state: 'SUBMITTED' },
      data: { state: 'WITHDRAWN' },
    })
    const requestId = await aRequest('CONTINUE')
    const suggestionId = await aDraft(requestId)
    await (await as(reader)).suggestion.submit({ suggestionId })
    const author = await as(owner)

    const preview = await author.compare.suggestionAgainstHead({ suggestionId })
    expect(preview.stats.removed).toBe(0)
    expect(preview.stats.changed).toBe(0)

    await author.suggestion.accept({ suggestionId })

    const request = await db.contributionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { section: { select: { currentRevision: { select: { contentText: true } } } } },
    })
    expect(request.section.currentRevision?.contentText).toBe(
      'The harbour had been empty for a year.\n\nIt was empty.',
    )
  })

  /**
   * 2026-10-16 spec review. The no-change check compared a hash of the plain
   * text, so formatting the same words was "nothing changed": no version was
   * written and the draft with the formatting was deleted, under "Saved".
   */
  it('saves a change of formatting as a new version, and keeps it', async () => {
    const { sectionId, revisionId } = await aSection(40, 'The harbour had been empty.')
    const italic = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'The harbour had been ' },
            { type: 'text', text: 'empty', marks: [{ type: 'em' }] },
            { type: 'text', text: '.' },
          ],
        },
      ],
    }

    // The plain words first, through the real save, so the head's stored hash
    // is the hash of exactly this text, as it is for every real section.
    const author = await as(owner)
    const plain = await author.section.commitRevision({
      sectionId,
      contentJson: prose('The harbour had been empty.'),
      baseRevisionId: revisionId,
    })

    const saved = await author.section.commitRevision({
      sectionId,
      contentJson: italic,
      baseRevisionId: plain.revisionId,
    })

    expect(saved.unchanged).toBe(false)
    const head = await db.section.findUniqueOrThrow({
      where: { id: sectionId },
      select: { currentRevision: { select: { contentJson: true } } },
    })
    expect(JSON.stringify(head.currentRevision?.contentJson)).toContain('"em"')
  })

  /** Somebody new's sent suggestion on a request, with this text. */
  async function aSentSuggestion(requestId: string, label: string, text: string) {
    const writer = await person(label)
    const call = await as(writer)
    const draft = await call.suggestion.startDraft({ requestId })
    await call.suggestion.saveDraft({ suggestionId: draft.id, contentJson: prose(text) })
    await call.suggestion.submit({ suggestionId: draft.id })
    return { writer, call, suggestionId: draft.id }
  }

  /**
   * FR-6.6 is about one section. An accept runs at SERIALIZABLE, and Postgres
   * may refuse one of two such transactions that touched nothing in common;
   * that reached the author as "this section changed" with nothing changed
   * (CI, 2026-10-24). Accepts on different sections all go in, even in one
   * story, where each also writes the story's `lastWrittenAt`.
   */
  it('accepts suggestions on different sections at the same moment, every one', async () => {
    const sent = await Promise.all(
      ['a', 'b', 'c', 'd'].map(async (label) =>
        aSentSuggestion(await aRequest(), `apart-${label}`, `The harbour, ${label}.`),
      ),
    )
    const author = await as(owner)

    const results = await Promise.allSettled(
      sent.map(({ suggestionId }) => author.suggestion.accept({ suggestionId })),
    )

    expect(results.filter((result) => result.status === 'rejected')).toEqual([])
  })

  it('lets one of two suggestions accepted on one section at once in, and tells the other', async () => {
    const requestId = await aRequest()
    const first = await aSentSuggestion(requestId, 'same-a', 'One way to say it.')
    const second = await aSentSuggestion(requestId, 'same-b', 'Another way to say it.')
    const author = await as(owner)

    const results = await Promise.allSettled([
      author.suggestion.accept({ suggestionId: first.suggestionId }),
      author.suggestion.accept({ suggestionId: second.suggestionId }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const refused = results.find((result) => result.status === 'rejected')
    expect(refused?.reason).toMatchObject({ code: 'CONFLICT' })
    const accepted = await db.revision.count({
      where: {
        suggestionId: { in: [first.suggestionId, second.suggestionId] },
        source: 'ACCEPTED',
      },
    })
    expect(accepted).toBe(1)
  })

  const headText = async (requestId: string) =>
    (
      await db.contributionRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: { section: { select: { currentRevision: { select: { contentText: true } } } } },
      })
    ).section.currentRevision?.contentText

  /**
   * FR-6.7 with FR-6.8. A suggestion goes stale only when another is
   * accepted, which answers the request; on 2026-10-15 sending to answered
   * requests was refused, so an updated stale suggestion could never be sent
   * again (2026-10-16 spec review).
   */
  it('takes a stale suggestion back, updated, without spending a send', async () => {
    const { key } = await import('@/server/limits')
    const requestId = await aRequest()
    const first = await aSentSuggestion(requestId, 'first', 'One way to say it.')
    const second = await aSentSuggestion(requestId, 'second', 'Another way to say it.')
    await (await as(owner)).suggestion.accept({ suggestionId: first.suggestionId })
    expect(
      (await db.suggestion.findUniqueOrThrow({ where: { id: second.suggestionId } })).state,
    ).toBe('STALE')

    const sends = () =>
      db.rateLimitHit.count({ where: { key: key.suggestionsSent(second.writer.id) } })
    const before = await sends()
    await second.call.suggestion.rebase({ suggestionId: second.suggestionId })
    await second.call.suggestion.submit({ suggestionId: second.suggestionId })

    expect(
      (await db.suggestion.findUniqueOrThrow({ where: { id: second.suggestionId } })).state,
    ).toBe('SUBMITTED')
    expect(await sends()).toBe(before)
  })

  /** FR-6.6 — "accept anyway" covers the change the author saw, and no later one. */
  it('accepts a stale suggestion only against the text the author was shown', async () => {
    const requestId = await aRequest()
    const first = await aSentSuggestion(requestId, 'shown-a', 'The first answer.')
    const second = await aSentSuggestion(requestId, 'shown-b', 'The second answer.')
    const author = await as(owner)
    await author.suggestion.accept({ suggestionId: first.suggestionId })

    await expect(author.suggestion.accept({ suggestionId: second.suggestionId })).rejects.toThrow(
      /changed a moment ago/u,
    )
    const { headRevisionId } = await author.compare.suggestionAgainstHead({
      suggestionId: second.suggestionId,
    })
    await author.suggestion.accept({
      suggestionId: second.suggestionId,
      acknowledgedHeadId: headRevisionId,
    })
    expect(await headText(requestId)).toBe('The second answer.')
  })

  /** FR-6.8 for continuations: the second replaces the first, not stacks after it. */
  it('puts a second continuation in place of the first, not after it', async () => {
    const requestId = await aRequest('CONTINUE')
    const leah = await aSentSuggestion(requestId, 'leah', 'Then the boats came back.')
    const arjun = await aSentSuggestion(requestId, 'arjun', 'Then nobody came at all.')
    const author = await as(owner)
    await author.suggestion.accept({ suggestionId: leah.suggestionId })
    expect(await headText(requestId)).toBe(
      'The harbour had been empty for a year.\n\nThen the boats came back.',
    )

    const { headRevisionId } = await author.compare.suggestionAgainstHead({
      suggestionId: arjun.suggestionId,
    })
    await author.suggestion.accept({
      suggestionId: arjun.suggestionId,
      acknowledgedHeadId: headRevisionId,
    })
    expect(await headText(requestId)).toBe(
      'The harbour had been empty for a year.\n\nThen nobody came at all.',
    )
  })

  /** An accepted suggestion's page shows what accepting it did. */
  it('compares an accepted suggestion with the text before it, not after', async () => {
    const requestId = await aRequest()
    const sent = await aSentSuggestion(requestId, 'accepted', 'An entirely new opening line.')
    const author = await as(owner)
    await author.suggestion.accept({ suggestionId: sent.suggestionId })

    const shown = await author.compare.suggestionAgainstHead({ suggestionId: sent.suggestionId })
    expect(shown.isStale).toBe(false)
    expect(shown.stats.changed + shown.stats.added + shown.stats.removed).toBeGreaterThan(0)
  })

  /**
   * The history's "What changed" on the first edit in an alternate version:
   * its parent is the main draft's revision, a different section row of the
   * same lineage, and the comparison refused it (2026-10-16 spec review).
   */
  it('shows what the first edit in an alternate version changed', async () => {
    const { sectionId } = await aSection(50, 'Words in the main draft.')
    const author = await as(owner)
    const main = await db.version.findFirstOrThrow({
      where: { storyboardId, isMain: true },
      select: { id: true },
    })
    const alternate = await author.version.create({ baseVersionId: main.id, name: 'Darker' })
    const lineage = await db.section.findUniqueOrThrow({
      where: { id: sectionId },
      select: { lineageId: true },
    })
    const copy = await db.section.findFirstOrThrow({
      where: { lineageId: lineage.lineageId, chapter: { versionId: alternate.id } },
      select: { id: true, currentRevisionId: true },
    })

    const edited = await author.section.commitRevision({
      sectionId: copy.id,
      contentJson: prose('Darker words in the alternate.'),
      baseRevisionId: copy.currentRevisionId,
    })
    const made = await db.revision.findUniqueOrThrow({
      where: { id: edited.revisionId ?? '' },
      select: { parentId: true },
    })

    const shown = await author.compare.revisions({
      baseId: made.parentId ?? '',
      targetId: edited.revisionId ?? '',
    })
    expect(shown.stats.changed + shown.stats.added + shown.stats.removed).toBeGreaterThan(0)
  })

  /**
   * FR-8.5 with FR-9.1. A restore only ever turned credits off, so putting an
   * accepted text back left its credit "no longer in the draft"; and one in
   * an alternate version turned off credits the main draft still carried
   * (2026-10-16 spec review).
   */
  it('turns a credit off and on again with its writing, in the main draft only', async () => {
    const requestId = await aRequest()
    const { suggestionId, writer } = await aSentSuggestion(requestId, 'restored', 'Restored.')
    const author = await as(owner)
    const { revisionId: accepted } = await author.suggestion.accept({ suggestionId })
    const { sectionId, before } = await db.revision
      .findUniqueOrThrow({ where: { id: accepted }, select: { sectionId: true, parentId: true } })
      .then((row) => ({ sectionId: row.sectionId, before: row.parentId ?? '' }))
    const live = async () =>
      (await db.credit.findFirstOrThrow({ where: { suggestionId }, select: { isLive: true } }))
        .isLive

    // In an alternate first: the main draft still has the writing.
    const main = await db.version.findFirstOrThrow({
      where: { storyboardId, isMain: true },
      select: { id: true },
    })
    const alternate = await author.version.create({ baseVersionId: main.id, name: 'Restored' })
    const copy = await db.section.findFirstOrThrow({
      where: { chapter: { versionId: alternate.id }, currentRevisionId: accepted },
      select: { id: true },
    })
    // Its history is the chain it stands on, the main draft's included.
    const copied = await author.section.history({ sectionId: copy.id })
    expect(copied.revisions.map((revision) => revision.id)).toEqual(
      expect.arrayContaining([accepted, before]),
    )
    await author.section.restoreRevision({ sectionId: copy.id, revisionId: before })
    expect(await live()).toBe(true)

    // In the main draft it is taken out, and the writer told...
    await author.section.restoreRevision({ sectionId, revisionId: before })
    expect(await live()).toBe(false)
    expect(
      await db.notification.count({ where: { userId: writer.id, type: 'CONTRIBUTION_REMOVED' } }),
    ).toBe(1)

    // ...and putting it back puts the credit back.
    await author.section.restoreRevision({ sectionId, revisionId: accepted })
    expect(await live()).toBe(true)
  })

  /**
   * Decision 0007's notice compared the whole history with one page of it,
   * so a section past fifty versions told readers it had been private for
   * part of its life (2026-10-16 spec review).
   */
  it('does not call a long history private when none of it was', async () => {
    const { sectionId, revisionId } = await aSection(80, 'Version 0.')
    const author = await as(owner)
    let head: string | null = revisionId
    for (let index = 1; index <= 3; index += 1) {
      head = (
        await author.section.commitRevision({
          sectionId,
          contentJson: prose(`Version ${String(index)}.`),
          baseRevisionId: head,
        })
      ).revisionId
    }

    const call = await as(reader)
    const shown = await call.section.history({ sectionId, take: 2 })
    expect(shown.revisions).toHaveLength(2)
    expect(shown.truncatedByVisibility).toBe(false)

    // And the rest can be reached: only the newest page could be, before.
    expect(shown.nextCursor).toBe(2)
    const older = await call.section.history({ sectionId, take: 2, cursor: shown.nextCursor })
    expect(older.revisions.map((revision) => revision.id)).toContain(revisionId)
    expect(older.nextCursor).toBeNull()
  })

  /**
   * FR-10.2 with FR-5.1. Promotion left open requests on the demoted draft,
   * and requests could be opened on an alternate at all, so an accept wrote
   * where no reader looks (2026-10-16 spec review).
   */
  it('carries open requests to the new main draft, and opens none on an alternate', async () => {
    const author = await as(owner)
    const main = await db.version.findFirstOrThrow({
      where: { storyboardId, isMain: true },
      select: { id: true },
    })
    const carriedId = await aRequest()
    const { suggestionId } = await aSentSuggestion(carriedId, 'carried', 'Carried over.')
    const strandedId = await aRequest()
    const alternate = await author.version.create({ baseVersionId: main.id, name: 'Lighter' })
    const lineageOf = async (requestId: string) =>
      (
        await db.contributionRequest.findUniqueOrThrow({
          where: { id: requestId },
          select: { section: { select: { lineageId: true } } },
        })
      ).section.lineageId
    // The alternate has no counterpart for the second request's section.
    await db.section.updateMany({
      where: { lineageId: await lineageOf(strandedId), chapter: { versionId: alternate.id } },
      data: { deletedAt: new Date() },
    })

    const inAlternate = await db.section.findFirstOrThrow({
      where: { chapter: { versionId: alternate.id }, deletedAt: null },
      select: { id: true },
    })
    await expect(
      author.request.create({
        sectionId: inAlternate.id,
        kind: 'UNBLOCK',
        title: 'Stuck',
        ask: 'I do not know what she does next, and every version I write of it reads like somebody else wrote it.',
        minWords: SUGGESTION_WORDS.floor,
        maxWords: SUGGESTION_WORDS.floor,
      }),
    ).rejects.toThrow(/main draft/u)

    try {
      await author.version.promoteToMain({ versionId: alternate.id })

      const carried = await db.contributionRequest.findUniqueOrThrow({
        where: { id: carriedId },
        select: { state: true, section: { select: { chapter: { select: { versionId: true } } } } },
      })
      expect(carried.state).toBe('ANSWERED')
      expect(carried.section.chapter.versionId).toBe(alternate.id)
      const stranded = await db.contributionRequest.findUniqueOrThrow({
        where: { id: strandedId },
        select: { state: true },
      })
      expect(stranded.state).toBe('CLOSED')

      // Accepting now writes into the draft that is main.
      await author.suggestion.accept({ suggestionId })
      expect(await headText(carriedId)).toBe('Carried over.')
    } finally {
      await author.version.promoteToMain({ versionId: main.id })
    }
  })

  /**
   * FR-9.6. A credit line's address had no page, and was built from the
   * stored order fields, not the reading positions the address is resolved
   * by; a section joined away kept its old place (2026-10-16 spec review).
   */
  it('gives a credit the address the reader opens, and follows it through a join', async () => {
    const { versionId } = await db.chapter.findUniqueOrThrow({
      where: { id: chapterId },
      select: { versionId: true },
    })
    // A chapter of its own, since a join renumbers its chapter; with gaps in
    // the order, as the address must not depend on there being none.
    const own = await db.chapter.create({
      data: { versionId, lineageId: randomUUID(), order: 7, title: 'Two' },
      select: { id: true },
    })
    await aSection(10, 'First.', own.id)
    const second = await aSection(20, 'Second.', own.id)
    const third = await aSection(30, 'Third.', own.id)
    const request = await db.contributionRequest.create({
      data: {
        publicId: randomUUID().replaceAll('-', '').slice(0, 10),
        storyboardId,
        sectionId: third.sectionId,
        openedById: owner.id,
        kind: 'REWRITE',
        title: 'Say it better',
        ask: 'Anything.',
        minWords: 1,
        maxWords: 1000,
      },
      select: { id: true },
    })
    const { suggestionId } = await aSentSuggestion(request.id, 'credited', 'Third, better.')
    const author = await as(owner)
    await author.suggestion.accept({ suggestionId })

    const { slug } = await db.storyboard.findUniqueOrThrow({
      where: { id: storyboardId },
      select: { slug: true },
    })
    const lineageOf = async (sectionId: string) =>
      (
        await db.section.findUniqueOrThrow({
          where: { id: sectionId },
          select: { lineageId: true },
        })
      ).lineageId
    const placeOfCredit = async () => {
      const { credits } = await author.credit.forStoryboard({ storyboardId })
      const lineage = await lineageOf(third.sectionId)
      return credits.find((credit) => credit.sectionLineage === lineage)?.place?.path
    }

    // Where the reader puts it: the second chapter's third section.
    const story = await author.storyboard.get({ slug })
    expect(story.chapters[1]?.sections[2]?.id).toBe(third.sectionId)
    expect(await placeOfCredit()).toBe(`/s/${slug}/c/2/3`)

    // Joined into the one above, its words are read there.
    await author.section.joinWithPrevious({ sectionId: third.sectionId })
    expect((await author.storyboard.get({ slug })).chapters[1]?.sections[1]?.id).toBe(
      second.sectionId,
    )
    expect(await placeOfCredit()).toBe(`/s/${slug}/c/2/2`)
  })

  /**
   * FR-12.1. Most notifications stored only ids, and the list and the emails
   * read a link and a title from the payload, so "your suggestion was
   * accepted" led nowhere and named nothing (2026-10-16 spec review).
   */
  it('leads each notification to what it is about', async () => {
    const requestId = await aRequest()
    const { call: writer, suggestionId } = await aSentSuggestion(requestId, 'told', 'Told.')
    const author = await as(owner)
    await author.suggestion.accept({ suggestionId })

    const { slug } = await db.storyboard.findUniqueOrThrow({
      where: { id: storyboardId },
      select: { slug: true },
    })
    const request = await db.contributionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { publicId: true },
    })
    const suggestion = await db.suggestion.findUniqueOrThrow({
      where: { id: suggestionId },
      select: { publicId: true },
    })
    const page = `/s/${slug}/help/${request.publicId}/s/${suggestion.publicId}`

    const arrived = (await author.notification.list({})).items.find(
      (row) => row.type === 'SUGGESTION_RECEIVED' && row.path === page,
    )
    expect(arrived?.title).toBe('Make it land')

    const accepted = (await writer.notification.list({})).items.find(
      (row) => row.type === 'SUGGESTION_ACCEPTED',
    )
    expect(accepted).toMatchObject({ path: page, title: 'Make it land' })
  })

  /**
   * SRS 3.1 and 3.2, FR-9.1, FR-12.2. Nothing made a co-author until the
   * 2026-10-16 spec review, so the matrix's whole co-author column was
   * unreachable.
   */
  it('makes a co-author by invitation, who writes, is credited, and can leave', async () => {
    const author = await as(owner)
    const writer = await person('coauthor')
    const call = await as(writer)
    const { sectionId, revisionId } = await aSection(110, 'Before the co-author.')

    // Not yet: an invitation grants nothing.
    const { invitationId } = await author.coauthor.invite({
      storyboardId,
      username: `@${writer.username.toUpperCase()}`,
    })
    await expect(
      call.section.commitRevision({
        sectionId,
        contentJson: prose('Too soon.'),
        baseRevisionId: revisionId,
      }),
    ).rejects.toThrow()
    const invited = (await call.notification.list({})).items.find(
      (row) => row.type === 'COAUTHOR_INVITED',
    )
    expect(invited).toMatchObject({ path: '/invitations', title: 'Integrity' })
    expect((await call.coauthor.invitations()).map((row) => row.id)).toContain(invitationId)

    await call.coauthor.accept({ invitationId })
    const written = await call.section.commitRevision({
      sectionId,
      contentJson: prose('Written by the co-author.'),
      baseRevisionId: revisionId,
    })
    expect(written.unchanged).toBe(false)
    expect(
      await db.credit.count({
        where: { storyboardId, contributorId: writer.id, type: 'COAUTHOR' },
      }),
    ).toBe(1)
    expect(
      await db.notification.count({ where: { userId: owner.id, type: 'COAUTHOR_ACCEPTED' } }),
    ).toBeGreaterThan(0)

    // Only the owner invites (SRS 3.2).
    const another = await person('not-invited')
    await expect(
      call.coauthor.invite({ storyboardId, username: another.username }),
    ).rejects.toThrow()

    // Three at most, invitations included.
    const list = await author.coauthor.list({ storyboardId })
    const room = list.max - list.coauthors.length
    const extra = []
    for (let index = 0; index < room; index += 1) {
      const invitee = await person(`invitee-${String(index)}`)
      extra.push(
        (await author.coauthor.invite({ storyboardId, username: invitee.username })).invitationId,
      )
    }
    await expect(
      author.coauthor.invite({ storyboardId, username: another.username }),
    ).rejects.toThrow(/at most/u)
    for (const id of extra) await author.coauthor.remove({ invitationId: id })

    // Leaving takes the right to write, and leaves the credit.
    await call.coauthor.remove({ invitationId })
    await expect(
      call.section.commitRevision({
        sectionId,
        contentJson: prose('After leaving.'),
        baseRevisionId: written.revisionId,
      }),
    ).rejects.toThrow()
    expect(
      await db.credit.count({
        where: { storyboardId, contributorId: writer.id, type: 'COAUTHOR' },
      }),
    ).toBe(1)
  })

  /**
   * FR-2.6. Nothing listed a deleted story, so `restore` had no caller;
   * restoring unfinished a finished story; and deleting closed none of its
   * requests and told nobody (2026-10-16 spec review).
   */
  it('brings a deleted story back as it was, and tells its helpers it went', async () => {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const story = await db.storyboard.create({
      data: {
        publicId: `dl${run}`,
        slug: `deleted-${run}`,
        title: `Deleted ${run}`,
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: owner.id,
      },
      select: { id: true },
    })
    try {
      const version = await db.version.create({
        data: { storyboardId: story.id, name: 'Main draft', isMain: true, createdById: owner.id },
        select: { id: true },
      })
      const chapter = await db.chapter.create({
        data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
        select: { id: true },
      })
      const { sectionId } = await aSection(0, 'A section.', chapter.id)
      const request = await db.contributionRequest.create({
        data: {
          publicId: `rq${run}`,
          storyboardId: story.id,
          sectionId,
          openedById: owner.id,
          kind: 'REWRITE',
          title: 'Help',
          ask: 'Anything.',
          minWords: 1,
          maxWords: 1000,
        },
        select: { id: true },
      })
      const drafter = await person('deleted-on')
      await (await as(drafter)).suggestion.startDraft({ requestId: request.id })
      const author = await as(owner)

      const stateOf = () =>
        db.storyboard.findUniqueOrThrow({
          where: { id: story.id },
          select: { state: true, deletedAt: true },
        })

      // Deleted while its request is open: the helper hears of it.
      await author.storyboard.delete({ storyboardId: story.id })
      expect(
        await db.notification.count({ where: { userId: drafter.id, type: 'REQUEST_CLOSED' } }),
      ).toBe(1)
      expect((await author.storyboard.listDeleted()).map((row) => row.id)).toContain(story.id)
      await author.storyboard.restore({ storyboardId: story.id })
      expect(await stateOf()).toEqual({ state: 'ACTIVE', deletedAt: null })
      expect((await author.storyboard.listDeleted()).map((row) => row.id)).not.toContain(story.id)

      // A finished story comes back finished.
      await author.storyboard.markFinished({ storyboardId: story.id, finished: true })
      await author.storyboard.delete({ storyboardId: story.id })
      await author.storyboard.restore({ storyboardId: story.id })
      expect(await stateOf()).toEqual({ state: 'FINISHED', deletedAt: null })
    } finally {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
        const where = { chapter: { version: { storyboardId: story.id } } }
        await tx.section.updateMany({ where, data: { currentRevisionId: null } })
        await tx.$executeRaw`
          WITH gone AS (
            DELETE FROM "Suggestion" AS s USING "ContributionRequest" AS r
            WHERE s."requestId" = r."id" AND r."storyboardId" = ${story.id}
          )
          DELETE FROM "Revision" AS v USING "Section" AS c, "Chapter" AS h, "Version" AS n
          WHERE v."sectionId" = c."id" AND c."chapterId" = h."id" AND h."versionId" = n."id"
            AND n."storyboardId" = ${story.id}`
        await tx.contributionRequest.deleteMany({ where: { storyboardId: story.id } })
        await tx.section.deleteMany({ where })
        await tx.chapter.deleteMany({ where: { version: { storyboardId: story.id } } })
        await tx.version.deleteMany({ where: { storyboardId: story.id } })
        await tx.storyboard.delete({ where: { id: story.id } })
      })
    }
  })

  /**
   * FR-2.7, decision 0039 (the owner's choice, 2026-10-16). `publicFrom` is
   * stamped once, so what was written while a story was private again became
   * readable the moment it was republished.
   */
  it('keeps what was written in a private stretch private when the story is public again', async () => {
    const { sectionId, revisionId } = await aSection(95, 'Public words.')
    const author = await as(owner)
    await author.storyboard.setVisibility({ storyboardId, visibility: 'PRIVATE' })
    const secret = await author.section.commitRevision({
      sectionId,
      contentJson: prose('Private words.'),
      baseRevisionId: revisionId,
    })
    await author.storyboard.setVisibility({ storyboardId, visibility: 'PUBLIC' })
    const later = await author.section.commitRevision({
      sectionId,
      contentJson: prose('Public again.'),
      baseRevisionId: secret.revisionId,
    })

    const call = await as(reader)
    const shown = await call.section.history({ sectionId })
    const ids = shown.revisions.map((revision) => revision.id)
    expect(ids).toEqual(expect.arrayContaining([revisionId, later.revisionId]))
    expect(ids).not.toContain(secret.revisionId)
    expect(shown.truncatedByVisibility).toBe(true)
    await expect(
      call.compare.revisions({ baseId: revisionId, targetId: secret.revisionId ?? '' }),
    ).rejects.toThrow(/does not exist/u)

    const { slug } = await db.storyboard.findUniqueOrThrow({
      where: { id: storyboardId },
      select: { slug: true },
    })
    expect((await call.storyboard.get({ slug })).privateStretches).toHaveLength(1)
    // The author sees all of it.
    expect((await author.section.history({ sectionId })).revisions.map((r) => r.id)).toContain(
      secret.revisionId,
    )
  })

  /**
   * FR-10.1 — a deleted alternate version is gone from everywhere a version
   * is resolved by id. Until phase 14 (item 1.1) `Version` had no tombstone:
   * the delete removed the chapters and left the row, so the version stayed
   * listed as "0 chapters", was still offered in Compare, and could still be
   * promoted, which made a main draft with no chapters and closed every open
   * request on the way.
   */
  it('removes a deleted alternate from the list, from compare and from promotion', async () => {
    await aSection(60, 'Words the alternate will copy.')
    const author = await as(owner)
    const { slug } = await db.storyboard.findUniqueOrThrow({
      where: { id: storyboardId },
      select: { slug: true },
    })
    const main = await db.version.findFirstOrThrow({
      where: { storyboardId, isMain: true },
      select: { id: true },
    })
    const alternate = await author.version.create({ baseVersionId: main.id, name: 'Discarded' })
    const before = (await author.version.list({ storyboardId })).versions.map((v) => v.id)
    expect(before).toContain(alternate.id)

    await author.version.delete({ versionId: alternate.id })

    const after = (await author.version.list({ storyboardId })).versions.map((v) => v.id)
    expect(after).not.toContain(alternate.id)
    expect(after).toContain(main.id)
    await expect(author.version.promoteToMain({ versionId: alternate.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await expect(author.storyboard.get({ slug, versionId: alternate.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      author.compare.versions({ baseVersionId: main.id, targetVersionId: alternate.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      author.version.rename({ versionId: alternate.id, name: 'Back' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // The main draft is untouched.
    const still = await db.version.findUniqueOrThrow({
      where: { id: main.id },
      select: { isMain: true },
    })
    expect(still.isMain).toBe(true)
  })

  it('makes no version without a chapter the main draft', async () => {
    const author = await as(owner)
    const bare = await db.version.create({
      data: { storyboardId, name: 'Bare', isMain: false, createdById: owner.id },
      select: { id: true },
    })
    await expect(author.version.promoteToMain({ versionId: bare.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    const main = await db.version.findFirstOrThrow({
      where: { storyboardId, isMain: true },
      select: { id: true },
    })
    expect(main.id).not.toBe(bare.id)
  })

  /**
   * FR-6.5 (phase 14, item 1.10) — a withdrawal is recorded, and the authors
   * are told only if one of them had opened the suggestion. Nothing wrote
   * `withdrawnAt`, nothing recorded an opening, and an author pressing Accept
   * on a suggestion withdrawn a moment before read "already been decided".
   */
  it('records a withdrawal, and tells the authors only if one had opened it', async () => {
    // A writer of its own: the shared reader is near FR-13.3's ten sends a
    // day by now, depending on how earlier tests' timing went, and this test
    // failed now and then on that limit rather than on what it checks.
    const writer = await person('withdrawer')
    const helper = await as(writer)
    const author = await as(owner)
    const aDraftOfTheirs = async (requestId: string) => {
      const draft = await helper.suggestion.startDraft({ requestId })
      await helper.suggestion.saveDraft({
        suggestionId: draft.id,
        contentJson: prose('It was empty.'),
      })
      return draft.id
    }
    const withdrawnTold = () =>
      db.notification.count({ where: { userId: owner.id, type: 'SUGGESTION_WITHDRAWN' } })

    // Unopened: recorded, and nobody told.
    const first = await aDraftOfTheirs(await aRequest())
    await helper.suggestion.submit({ suggestionId: first })
    await helper.suggestion.withdraw({ suggestionId: first })
    const quiet = await db.suggestion.findUniqueOrThrow({
      where: { id: first },
      select: { state: true, withdrawnAt: true, openedAt: true },
    })
    expect(quiet.state).toBe('WITHDRAWN')
    expect(quiet.withdrawnAt).toBeInstanceOf(Date)
    expect(quiet.openedAt).toBeNull()
    expect(await withdrawnTold()).toBe(0)

    // Opened by an author, then withdrawn: recorded, and the authors told.
    const second = await aDraftOfTheirs(await aRequest())
    const sent = await helper.suggestion.submit({ suggestionId: second })
    await author.suggestion.get({ publicId: sent.publicId })
    const opened = await db.suggestion.findUniqueOrThrow({
      where: { id: second },
      select: { openedAt: true },
    })
    expect(opened.openedAt).toBeInstanceOf(Date)
    await helper.suggestion.withdraw({ suggestionId: second })
    expect(await withdrawnTold()).toBe(1)

    // An author deciding on it a moment later reads who withdrew it.
    await expect(author.suggestion.accept({ suggestionId: second })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/withdrew this a moment ago/i),
    })
    await expect(author.suggestion.pass({ suggestionId: second })).rejects.toMatchObject({
      message: expect.stringMatching(/withdrew this a moment ago/i),
    })
  })

  /**
   * FR-6.2, FR-6.7 (phase 14, item 1.11) — the note to the author survives a
   * draft and a re-send. The composer kept it in memory only, so leaving it as
   * a draft lost it, and sending a rebased suggestion again without typing the
   * note again erased it.
   */
  it('keeps the note through a draft and a re-send', async () => {
    // A helper of its own: the shared reader is near the ten sends a day the
    // earlier tests spend (FR-13.3).
    const helper = await as(await person('noted'))
    const noteOf = async (id: string) =>
      (await db.suggestion.findUniqueOrThrow({ where: { id }, select: { note: true } })).note

    const draft = (await helper.suggestion.startDraft({ requestId: await aRequest() })).id
    await helper.suggestion.saveDraft({
      suggestionId: draft,
      contentJson: prose('It was empty.'),
      note: 'Kept it short.',
    })
    expect(await noteOf(draft)).toBe('Kept it short.')

    // Sent without the note in the input: the stored one stands.
    await helper.suggestion.submit({ suggestionId: draft })
    expect(await noteOf(draft)).toBe('Kept it short.')

    // Gone stale, updated and sent again, still without typing the note again.
    await db.suggestion.update({ where: { id: draft }, data: { state: 'STALE' } })
    await helper.suggestion.rebase({ suggestionId: draft })
    await helper.suggestion.submit({ suggestionId: draft })
    expect(await noteOf(draft)).toBe('Kept it short.')
  })

  /**
   * FR-5.9, FR-6.9, FR-12.4 (phase 14, item 1.12) — a "help me think" request
   * moves through its states on ideas as a prose request does on suggestions:
   * the first idea from outside the story answers it, "This one helped"
   * resolves it, and the quiet nudge counts only such ideas. Ideas never
   * moved a request, and the author's own reply took it out of the nudge.
   */
  it('moves a help-me-think request on ideas from outside, and nudges only without one', async () => {
    const author = await as(owner)
    const helper = await as(reader)
    const requestId = await aRequest('UNBLOCK')
    const stateOf = () =>
      db.contributionRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: { state: true, resolvedAt: true },
      })
    const idea =
      'One option is that the harbour was never empty at all, and she has been looking at the wrong harbour since the first page.'

    // The author's own idea is not an answer, and leaves the request quiet.
    await author.idea.post({ requestId, body: idea })
    expect((await stateOf()).state).toBe('OPEN')
    await db.contributionRequest.update({
      where: { id: requestId },
      data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    })
    const { runQuietNudge } = await import('@/server/mail/digests')
    const nudged: string[] = []
    await runQuietNudge(db, new Date(), {
      mailer: {
        send: async (mail) => {
          nudged.push(mail.subject)
        },
      },
    })
    expect(nudged.some((subject) => subject.includes('Make it land'))).toBe(true)

    // A helper's idea answers it; marked as the one that helped, it is resolved.
    const answer = await helper.idea.post({ requestId, body: idea })
    expect((await stateOf()).state).toBe('ANSWERED')
    await author.idea.markHelpful({ ideaId: answer.id })
    const resolved = await stateOf()
    expect(resolved.state).toBe('RESOLVED')
    expect(resolved.resolvedAt).toBeInstanceOf(Date)

    // Opened again, it is answered, because the answer is still there.
    const before = await db.contributionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { openedAt: true },
    })
    await author.request.reopen({ requestId })
    expect((await stateOf()).state).toBe('ANSWERED')
    // Item 6.15 (D-8) — and its thirty days start again.
    const again = await db.contributionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { openedAt: true },
    })
    expect(again.openedAt.getTime()).toBeGreaterThan(before.openedAt.getTime())
  })

  /**
   * FR-11.1, FR-11.3 (phase 14, item 1.17) — lists show what they say. The
   * dashboard's "in your genres" region listed the viewer's own requests, and
   * browse's type filter never reached the query.
   */
  it('lists open requests from other people only, and filters stories by type', async () => {
    const requestId = await aRequest()
    const own = await (await as(owner)).request.listOpen()
    expect(own.some((request) => request.id === requestId)).toBe(false)
    const theirs = await (await as(reader)).request.listOpen()
    expect(theirs.some((request) => request.id === requestId)).toBe(true)

    const call = await as(reader)
    // A page of stories since item 9.1, with the count beside it.
    const novels = await call.browse.storyboards({ types: ['NOVEL'] })
    expect(novels.storyboards.some((story) => story.id === storyboardId)).toBe(true)
    const plays = await call.browse.storyboards({ types: ['STAGE_PLAY'] })
    expect(plays.storyboards.some((story) => story.id === storyboardId)).toBe(false)
  })

  /**
   * FR-6.9, FR-9.1 (phase 14, item 1.7; decision 0041) — an owner who accepts
   * their own suggestion on their own story is its author, not a contributor:
   * the revision names them, and no credit is made.
   */
  it('makes no credit for an author accepting their own suggestion', async () => {
    const author = await as(owner)
    const requestId = await aRequest()
    const draft = await author.suggestion.startDraft({ requestId })
    await author.suggestion.saveDraft({
      suggestionId: draft.id,
      contentJson: prose('The author did it.'),
    })
    await author.suggestion.submit({ suggestionId: draft.id })
    const accepted = await author.suggestion.accept({ suggestionId: draft.id })
    const revision = await db.revision.findUniqueOrThrow({
      where: { id: accepted.revisionId ?? '' },
      select: { authorId: true },
    })
    expect(revision.authorId).toBe(owner.id)
    expect(await db.credit.count({ where: { suggestionId: draft.id } })).toBe(0)
  })

  // Last, because it makes the shared story private.
  it('stops naming a story in a reader’s own lists once it is private to them', async () => {
    const call = await as(reader)
    expect((await call.suggestion.listMine()).length).toBeGreaterThan(0)
    expect((await call.notification.list({})).items.some((row) => row.path !== null)).toBe(true)

    await db.storyboard.update({
      where: { id: storyboardId },
      data: { visibility: 'PRIVATE', title: 'A new, private title' },
    })

    expect(await call.suggestion.listMine()).toEqual([])
    const news = await call.request.withNews()
    expect(JSON.stringify(news)).not.toContain('A new, private title')
    // Their notifications still say what happened, and no longer where.
    const told = (await call.notification.list({})).items
    expect(told.length).toBeGreaterThan(0)
    expect(told.every((row) => row.path === null && row.title === null)).toBe(true)
  })

  // Phase 14, item 5.7 (decision 0008) — what was removed can come back.
  it('brings a removed section back at the end of its chapter, and a chapter with its sections', async () => {
    const author = await as(owner)
    const { versionId } = await db.chapter.findUniqueOrThrow({
      where: { id: chapterId },
      select: { versionId: true },
    })
    await aSection(30)
    const gone = await aSection(31)
    await author.section.delete({ sectionId: gone.sectionId })
    const listed = await author.chapter.removed({ versionId })
    expect(listed.sections.map((section) => section.id)).toContain(gone.sectionId)

    expect(await author.section.restore({ sectionId: gone.sectionId })).toEqual({
      ok: true,
      restored: true,
    })
    const last = await db.section.findFirst({
      where: { chapterId, deletedAt: null, mergedIntoId: null },
      orderBy: { order: 'desc' },
      select: { id: true },
    })
    expect(last?.id).toBe(gone.sectionId)
    // Not listed any more, and a second restore changes nothing.
    expect((await author.chapter.removed({ versionId })).sections).not.toContainEqual(
      expect.objectContaining({ id: gone.sectionId }),
    )
    expect(await author.section.restore({ sectionId: gone.sectionId })).toEqual({
      ok: true,
      restored: false,
    })

    // A chapter goes with its sections, and comes back with them, at the end.
    const chapter = await db.chapter.create({
      data: { versionId, lineageId: randomUUID(), order: 99, title: 'Removable' },
      select: { id: true },
    })
    const inside = await aSection(0, 'Inside the removable chapter.', chapter.id)
    await author.chapter.delete({ chapterId: chapter.id })
    const removed = await author.chapter.removed({ versionId })
    expect(removed.chapters.map((entry) => entry.id)).toContain(chapter.id)
    // Its section is not offered on its own: it comes back with the chapter.
    expect(removed.sections.map((entry) => entry.id)).not.toContain(inside.sectionId)
    await expect(author.section.restore({ sectionId: inside.sectionId })).rejects.toThrow(
      /chapter back first/u,
    )

    expect(await author.chapter.restore({ chapterId: chapter.id })).toEqual({
      ok: true,
      restored: true,
    })
    const rows = await db.section.findMany({
      where: { chapterId: chapter.id },
      select: { deletedAt: true },
    })
    expect(rows.every((row) => row.deletedAt === null)).toBe(true)
    const lastChapter = await db.chapter.findFirst({
      where: { versionId, deletedAt: null },
      orderBy: { order: 'desc' },
      select: { id: true },
    })
    expect(lastChapter?.id).toBe(chapter.id)
  })

  it('does not bring back a section joined into another, nor one from a deleted version', async () => {
    const author = await as(owner)
    const above = await aSection(40)
    const below = await aSection(41)
    await author.section.joinWithPrevious({ sectionId: below.sectionId })
    await expect(author.section.restore({ sectionId: below.sectionId })).rejects.toThrow(
      /joined into another/u,
    )
    expect(above.sectionId).toBeTruthy()

    // Item 1.1 — a deleted version's chapters stay where they are.
    const version = await db.version.create({
      data: {
        storyboardId,
        name: 'Doomed',
        isMain: false,
        createdById: owner.id,
        deletedAt: new Date(),
      },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: {
        versionId: version.id,
        lineageId: randomUUID(),
        order: 0,
        title: 'Lost',
        deletedAt: new Date(),
      },
      select: { id: true },
    })
    await expect(author.chapter.restore({ chapterId: chapter.id })).rejects.toThrow(
      /version was deleted/u,
    )
  })

  // Phase 14, item 6.1 — a request can be changed while it is open, by its
  // authors, within the same bounds as opening; never its kind or section.
  it('lets the author change an open request, within the rules, and nobody else', async () => {
    const author = await as(owner)
    const stranger = await as(reader)
    const requestId = await aRequest('REWRITE')
    const base = {
      requestId,
      title: 'The turn, again',
      ask: 'The turn still does not land, and now I think the problem is the sentence before it rather than the one after.',
      preContext: Array.from({ length: 110 }, (_, index) => `word${String(index)}`).join(' '),
      toneNotes: 'Dry.',
      characterNotes: 'Ruth never explains herself.',
      constraints: ['No dialogue'],
      minWords: 200,
      maxWords: 900,
    }

    await expect(stranger.request.update(base)).rejects.toThrow()

    const changed = await author.request.update(base)
    expect(changed.editedAt).toBeInstanceOf(Date)
    const row = await db.contributionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { title: true, characterNotes: true, minWords: true, maxWords: true, kind: true },
    })
    expect(row).toEqual({
      title: 'The turn, again',
      characterNotes: 'Ruth never explains herself.',
      minWords: 200,
      maxWords: 900,
      kind: 'REWRITE',
    })

    // The bounds of opening still hold: a story-so-far too short for a prose
    // request, and a smallest number above the largest.
    await expect(author.request.update({ ...base, preContext: 'Too short.' })).rejects.toThrow(
      /at least/u,
    )
    await expect(author.request.update({ ...base, minWords: 900, maxWords: 200 })).rejects.toThrow(
      /smaller/u,
    )

    // Closed: not until it is open again.
    await author.request.close({ requestId })
    await expect(author.request.update(base)).rejects.toThrow(/open/u)
  })

  // Phase 14, items 6.3 and 6.4 — what may still be sent, read before writing.
  it('says how many suggestions wait against the quota, and how many sends the day has left', async () => {
    // An earlier test leaves the shared story private; a reader needs it public.
    await db.storyboard.update({ where: { id: storyboardId }, data: { visibility: 'PUBLIC' } })
    const helper = await as(reader)
    const requestId = await aRequest('REWRITE')

    // Earlier tests may have left the reader's suggestions waiting here, so
    // the counts are read as differences.
    const before = await helper.suggestion.allowance({ storyboardId })
    expect(before.quota).toBe(3)
    expect(before.sendsLeftToday).toBeGreaterThanOrEqual(0)
    expect(before.sendsLeftToday).toBeLessThanOrEqual(10)

    // A draft waits on nobody; a sent one does.
    const draftId = await aDraft(requestId)
    expect((await helper.suggestion.allowance({ storyboardId })).waiting).toBe(before.waiting)
    await db.suggestion.update({
      where: { id: draftId },
      data: { state: 'SUBMITTED', submittedAt: new Date() },
    })
    expect((await helper.suggestion.allowance({ storyboardId })).waiting).toBe(before.waiting + 1)

    // The owner has no cap on their own story.
    expect((await (await as(owner)).suggestion.allowance({ storyboardId })).quota).toBeNull()
  })

  // Phase 14, item 6.5 — a draft can be thrown away; only yours, only a draft.
  it('throws away only your own draft, and never a sent suggestion', async () => {
    await db.storyboard.update({ where: { id: storyboardId }, data: { visibility: 'PUBLIC' } })
    const helper = await as(reader)
    const requestId = await aRequest('REWRITE')
    const draftId = await aDraft(requestId)

    await expect(
      (await as(owner)).suggestion.discardDraft({ suggestionId: draftId }),
    ).rejects.toThrow(/not a draft of yours/u)
    expect(await helper.suggestion.discardDraft({ suggestionId: draftId })).toEqual({
      removed: true,
    })
    expect(await db.suggestion.findUnique({ where: { id: draftId } })).toBeNull()

    const sentId = await aDraft(requestId)
    await db.suggestion.update({
      where: { id: sentId },
      data: { state: 'SUBMITTED', submittedAt: new Date() },
    })
    await expect(helper.suggestion.discardDraft({ suggestionId: sentId })).rejects.toThrow(
      /withdrawn/u,
    )
  })

  // Phase 14, item 6.6 — a draft started against old text can move its base;
  // its words are left alone.
  it('moves a draft to the new text when asked, and leaves its words as they were', async () => {
    await db.storyboard.update({ where: { id: storyboardId }, data: { visibility: 'PUBLIC' } })
    const helper = await as(reader)
    const author = await as(owner)
    const requestId = await aRequest('REWRITE')
    const draftId = await aDraft(requestId)
    const before = await db.suggestion.findUniqueOrThrow({
      where: { id: draftId },
      select: { baseRevisionId: true, contentText: true, request: { select: { sectionId: true } } },
    })

    await author.section.commitRevision({
      sectionId: before.request.sectionId,
      contentJson: prose('The harbour, revised while the draft waited.'),
      baseRevisionId: before.baseRevisionId ?? undefined,
    })

    const moved = await helper.suggestion.rebase({ suggestionId: draftId })
    expect(moved.state).toBe('DRAFT')
    expect(moved.baseRevisionId).not.toBe(before.baseRevisionId)
    const after = await db.suggestion.findUniqueOrThrow({
      where: { id: draftId },
      select: { contentText: true, baseRevisionId: true },
    })
    expect(after.contentText).toBe(before.contentText)
    const head = await db.section.findUniqueOrThrow({
      where: { id: before.request.sectionId },
      select: { currentRevisionId: true },
    })
    expect(after.baseRevisionId).toBe(head.currentRevisionId)
  })

  // Phase 14, item 6.7 (D-12) — a sent suggestion changes until an author opens it.
  it('lets its writer change a sent suggestion until an author opens it, and nobody else', async () => {
    await db.storyboard.update({ where: { id: storyboardId }, data: { visibility: 'PUBLIC' } })
    const helper = await as(reader)
    const requestId = await aRequest('REWRITE')
    const sentId = await aDraft(requestId)
    await db.suggestion.update({
      where: { id: sentId },
      data: { state: 'SUBMITTED', submittedAt: new Date() },
    })

    await expect(
      (await as(owner)).suggestion.edit({ suggestionId: sentId, contentJson: prose('Not mine.') }),
    ).rejects.toThrow(/not yours/u)

    const changed = await helper.suggestion.edit({
      suggestionId: sentId,
      contentJson: prose('The harbour had been empty for a year, and she had counted every day.'),
      note: 'Tightened the first sentence.',
    })
    expect(changed.editedAt).toBeInstanceOf(Date)
    const row = await db.suggestion.findUniqueOrThrow({
      where: { id: sentId },
      select: { contentText: true, note: true, editedAt: true, state: true },
    })
    expect(row.contentText).toContain('counted every day')
    expect(row.note).toBe('Tightened the first sentence.')
    expect(row.state).toBe('SUBMITTED')

    // The bounds the request set still hold.
    await db.contributionRequest.update({ where: { id: requestId }, data: { minWords: 50 } })
    await expect(
      helper.suggestion.edit({
        suggestionId: sentId,
        contentJson: prose('Five words are not enough.'),
      }),
    ).rejects.toThrow(/between 50 and/u)
    await db.contributionRequest.update({ where: { id: requestId }, data: { minWords: 1 } })

    // Opened by an author: the same words, whichever read saw it unopened.
    await db.suggestion.update({ where: { id: sentId }, data: { openedAt: new Date() } })
    await expect(
      helper.suggestion.edit({ suggestionId: sentId, contentJson: prose('Too late.') }),
    ).rejects.toThrow(/started reading/u)
  })
})
