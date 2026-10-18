/**
 * Decision 0046 (phase 14, item 2.9; D-9) — blocking a person. Someone an
 * author blocked still reads the story, cannot start, send or post help on
 * it, is told why in one sentence, and tells the blocker nothing. A
 * co-author's block counts as the owner's; lifting a block opens the door.
 *
 * Readers get the real request context (`createTRPCContext`, session mocked).
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { BLOCKED_FROM_HELPING } from '@/lib/schemas/help'

let signedIn: { id: string; username: string } | null = null

vi.mock('@/auth', () => ({
  auth: async () =>
    signedIn
      ? { user: { id: signedIn.id, username: signedIn.username, onboarded: true }, expires: '' }
      : null,
}))

const databaseUrl = process.env.DATABASE_URL

/** Twenty words or more (FR-6.9). */
const IDEA =
  'One option is that the harbour was never empty at all, and she has been looking at the wrong harbour since the first page.'

describe.skipIf(!databaseUrl)('blocking a person (item 2.9)', () => {
  let db: PrismaClient
  const people: string[] = []
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner = { id: '', username: '' }
  let coauthor = { id: '', username: '' }
  let helper = { id: '', username: '' }
  let stranger = { id: '', username: '' }
  let storyboardId = ''
  let slug = ''
  let proseRequestId = ''
  let proseRequestPublicId = ''
  let ideasRequestId = ''
  let suggestionId = ''

  async function person(label: string) {
    const username = `bl-${label}-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

  async function as(who: { id: string; username: string } | null) {
    signedIn = who
    const { createCallerFactory, createTRPCContext } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)(await createTRPCContext({ headers: new Headers() }))
  }

  const told = (userId: string, type: 'SUGGESTION_WITHDRAWN') =>
    db.notification.count({ where: { userId, type } })

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    coauthor = await person('co')
    helper = await person('helper')
    stranger = await person('stranger')

    slug = `blocked-${run}`
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `bl${run}`,
        slug,
        title: 'The weir in winter',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: owner.id,
        collaborators: {
          create: { userId: coauthor.id, invitedById: owner.id, acceptedAt: new Date() },
        },
      },
      select: { id: true },
    })
    storyboardId = storyboard.id
    const version = await db.version.create({
      data: { storyboardId, name: 'Main draft', isMain: true, createdById: owner.id },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 3 },
      select: { id: true },
    })
    const revision = await db.revision.create({
      data: {
        sectionId: section.id,
        contentJson: { type: 'doc', content: [] },
        contentText: 'Three short words.',
        wordCount: 3,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: owner.id,
      },
      select: { id: true },
    })
    await db.section.update({ where: { id: section.id }, data: { currentRevisionId: revision.id } })

    // One open request per section is an invariant of the schema; the ideas
    // go on a second section.
    const second = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 1, wordCount: 0 },
      select: { id: true },
    })
    proseRequestPublicId = `blp${run}`
    proseRequestId = (
      await db.contributionRequest.create({
        data: {
          publicId: proseRequestPublicId,
          storyboardId,
          sectionId: section.id,
          openedById: owner.id,
          kind: 'CONTINUE',
          state: 'OPEN',
          title: 'What comes next',
          ask: 'The morning after, and what she does with the book.',
          preContext: 'She has kept the log for eleven years.',
        },
        select: { id: true },
      })
    ).id
    ideasRequestId = (
      await db.contributionRequest.create({
        data: {
          publicId: `bli${run}`,
          storyboardId,
          sectionId: second.id,
          openedById: owner.id,
          kind: 'UNBLOCK',
          state: 'OPEN',
          title: 'Stuck here',
          ask: 'Which way should this go?',
        },
        select: { id: true },
      })
    ).id
    // Sent, and opened by an author, before any block: taking it back would
    // tell the authors (item 1.10).
    suggestionId = (
      await db.suggestion.create({
        data: {
          publicId: `bls${run}`,
          requestId: proseRequestId,
          contributorId: helper.id,
          baseRevisionId: revision.id,
          contentJson: { type: 'doc', content: [] },
          contentText: 'A suggestion sent before the block.',
          wordCount: 6,
          state: 'SUBMITTED',
          submittedAt: new Date(),
          openedAt: new Date(),
        },
        select: { id: true },
      })
    ).id
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      await tx.credit.deleteMany({ where: { storyboardId } })
      await tx.idea.deleteMany({ where: { request: { storyboardId } } })
      await tx.sectionDraft.deleteMany({ where: { userId: { in: people } } })
      await tx.suggestion.deleteMany({ where: { request: { storyboardId } } })
      await tx.contributionRequest.deleteMany({ where: { storyboardId } })
      const sections = { chapter: { version: { storyboardId } } }
      await tx.section.updateMany({ where: sections, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { section: sections } })
      await tx.section.deleteMany({ where: sections })
      await tx.chapter.deleteMany({ where: { version: { storyboardId } } })
      await tx.version.deleteMany({ where: { storyboardId } })
      await tx.collaborator.deleteMany({ where: { storyboardId } })
      await tx.storyboard.deleteMany({ where: { id: storyboardId } })
      await tx.notification.deleteMany({ where: { userId: { in: people } } })
      await tx.activityDay.deleteMany({ where: { userId: { in: people } } })
      await tx.rateLimitHit.deleteMany({ where: { key: { contains: run } } }).catch(() => undefined)
      await tx.userBlock.deleteMany({ where: { blockerId: { in: people } } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  it('keeps a blocked person out of helping, tells them why, and leaves them reading', async () => {
    await (await as(owner)).block.set({ userId: helper.id, blocked: true })

    const blocked = await as(helper)
    await expect(
      blocked.suggestion.startDraft({ requestId: proseRequestId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: BLOCKED_FROM_HELPING })
    await expect(
      blocked.idea.post({ requestId: ideasRequestId, body: IDEA }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: BLOCKED_FROM_HELPING })
    const page = await blocked.request.get({ publicId: proseRequestPublicId })
    expect(page.blockedFromHelping).toBe(true)
    expect(page.permissions.canSubmitSuggestion).toBe(false)
    expect(page.permissions.canPostIdea).toBe(false)
    await expect(blocked.storyboard.get({ slug })).resolves.toBeDefined()

    // Only them: a stranger helps as before.
    const other = await (await as(stranger)).request.get({ publicId: proseRequestPublicId })
    expect(other.blockedFromHelping).toBe(false)
    expect(other.permissions.canSubmitSuggestion).toBe(true)
  })

  it('tells the blocker nothing of what the blocked person still does', async () => {
    // The owner blocked them; the co-author did not. Taking back a suggestion
    // an author had opened tells the authors (item 1.10): here, only the one
    // who did not block.
    await (await as(helper)).suggestion.withdraw({ suggestionId })
    expect(await told(owner.id, 'SUGGESTION_WITHDRAWN')).toBe(0)
    expect(await told(coauthor.id, 'SUGGESTION_WITHDRAWN')).toBe(1)
  })

  it('counts a co-author’s block as the owner’s, and opens the door when it is lifted', async () => {
    await (await as(owner)).block.set({ userId: helper.id, blocked: false })
    await (await as(coauthor)).block.set({ userId: helper.id, blocked: true })
    await expect(
      (await as(helper)).suggestion.startDraft({ requestId: proseRequestId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: BLOCKED_FROM_HELPING })

    await (await as(coauthor)).block.set({ userId: helper.id, blocked: false })
    const draft = await (await as(helper)).suggestion.startDraft({ requestId: proseRequestId })
    expect(draft.id).toBeTruthy()
    const page = await (await as(helper)).request.get({ publicId: proseRequestPublicId })
    expect(page.blockedFromHelping).toBe(false)
  })

  it('refuses blocking yourself, lists who you blocked, and the profile knows', async () => {
    const mine = await as(owner)
    await expect(mine.block.set({ userId: owner.id, blocked: true })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    await mine.block.set({ userId: stranger.id, blocked: true })
    expect((await mine.block.list()).map((row) => row.blocked.id)).toEqual([stranger.id])

    expect(await mine.profile.byUsername({ username: stranger.username })).toMatchObject({
      canBlock: true,
      blockedByMe: true,
    })
    expect(await mine.profile.byUsername({ username: helper.username })).toMatchObject({
      canBlock: true,
      blockedByMe: false,
    })
    expect(await mine.profile.byUsername({ username: owner.username })).toMatchObject({
      isSelf: true,
      canBlock: false,
    })
    expect(await (await as(null)).profile.byUsername({ username: owner.username })).toMatchObject({
      canBlock: false,
      blockedByMe: false,
    })
  })
})
