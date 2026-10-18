/**
 * FR-11.1 (phase 14, item 6.14) — "Needs you": the suggestions waiting for an
 * author's decision, oldest first, and the "help me think" requests with
 * ideas and none yet marked as the one that helped. For the owner and an
 * accepted co-author alike, and for nobody else.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('needs you (item 6.14)', () => {
  let db: PrismaClient
  const people: string[] = []
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner = { id: '', username: '' }
  let coauthor = { id: '', username: '' }
  let helper = { id: '', username: '' }
  let storyboardId = ''
  let olderId = ''
  let newerId = ''
  let thinkingId = ''

  async function person(label: string) {
    const username = `ny-${label}-${run}`
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

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    coauthor = await person('coauthor')
    helper = await person('helper')
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `ny${run}`,
        slug: `needs-you-${run}`,
        title: 'Needs you',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: owner.id,
      },
      select: { id: true },
    })
    storyboardId = storyboard.id
    await db.collaborator.create({
      data: {
        storyboardId,
        userId: coauthor.id,
        invitedById: owner.id,
        acceptedAt: new Date(),
      },
    })
    const version = await db.version.create({
      data: { storyboardId, name: 'Main draft', isMain: true, createdById: owner.id },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 2, title: 'Three' },
      select: { id: true },
    })

    /** A section of its own, a request on it, and a revision to write against. */
    async function passage(
      order: number,
      kind: 'REWRITE' | 'UNBLOCK',
      state: 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'CLOSED',
      tag: string,
    ) {
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
          kind,
          state,
          title: `Passage ${tag}`,
          ask: 'Which way should this go, and why that way?',
          minWords: 100,
          maxWords: 200,
        },
        select: { id: true },
      })
      return { requestId: request.id, revisionId: revision.id }
    }
    const suggestion = async (
      requestId: string,
      revisionId: string,
      tag: string,
      submittedAt: Date,
      hiddenAt: Date | null = null,
    ) =>
      (
        await db.suggestion.create({
          data: {
            publicId: `s${tag}${run}`,
            requestId,
            contributorId: helper.id,
            baseRevisionId: revisionId,
            contentJson: { type: 'doc', content: [] },
            contentText: 'A version.',
            state: 'SUBMITTED',
            submittedAt,
            hiddenAt,
          },
          select: { id: true },
        })
      ).id

    const answered = await passage(0, 'REWRITE', 'ANSWERED', 'a')
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    newerId = await suggestion(answered.requestId, answered.revisionId, 'n', yesterday)
    olderId = await suggestion(answered.requestId, answered.revisionId, 'o', twoDaysAgo)
    // Hidden after a report: cannot be accepted, so it waits on nobody.
    await suggestion(answered.requestId, answered.revisionId, 'h', yesterday, new Date())
    // On a request closed without accepting: readable, not waiting (FR-5.10).
    const closed = await passage(1, 'REWRITE', 'CLOSED', 'c')
    await suggestion(closed.requestId, closed.revisionId, 'x', yesterday)

    // Help me think: an idea from outside, a reply under it, none marked.
    const thinking = await passage(2, 'UNBLOCK', 'ANSWERED', 't')
    thinkingId = thinking.requestId
    const idea = await db.idea.create({
      data: {
        requestId: thinking.requestId,
        authorId: helper.id,
        body: 'One option is that she never left the harbour at all, and the ship she remembers is the one she drew.',
      },
      select: { id: true },
    })
    await db.idea.create({
      data: {
        requestId: thinking.requestId,
        authorId: owner.id,
        parentId: idea.id,
        body: 'Go on.',
      },
    })
    // Resolved by an idea that helped: nothing waits.
    const helped = await passage(3, 'UNBLOCK', 'RESOLVED', 'd')
    await db.idea.create({
      data: {
        requestId: helped.requestId,
        authorId: helper.id,
        body: 'Another option is that the harbourmaster lied, and the log was right all along about the ship.',
        markedHelpful: true,
      },
    })
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboardId } } }
      await tx.idea.deleteMany({ where: { request: { storyboardId } } })
      await tx.suggestion.deleteMany({ where: { request: { storyboardId } } })
      await tx.contributionRequest.deleteMany({ where: { storyboardId } })
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { section: where } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboardId } } })
      await tx.version.deleteMany({ where: { storyboardId } })
      await tx.collaborator.deleteMany({ where: { storyboardId } })
      await tx.storyboard.deleteMany({ where: { id: storyboardId } })
      await tx.notification.deleteMany({ where: { userId: { in: people } } })
      await tx.activityDay.deleteMany({ where: { userId: { in: people } } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  it('lists the suggestions waiting on the author, the one that has waited longest first', async () => {
    const { suggestions, requests } = await (await as(owner)).request.needsYou()
    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([olderId, newerId])
    expect(suggestions[0]?.contributor.username).toBe(helper.username)
    expect(suggestions[0]?.request.section.chapter.order).toBe(2)
    // And the request thinking aloud, with its one idea (the reply is not one).
    expect(requests.map((request) => [request.id, request.ideas])).toEqual([[thinkingId, 1]])
  })

  it('shows an accepted co-author the same, and a helper nothing', async () => {
    const theirs = await (await as(coauthor)).request.needsYou()
    expect(theirs.suggestions.map((suggestion) => suggestion.id)).toEqual([olderId, newerId])
    expect(theirs.requests).toHaveLength(1)

    const nothing = await (await as(helper)).request.needsYou()
    expect(nothing).toEqual({ suggestions: [], requests: [] })
  })
})
