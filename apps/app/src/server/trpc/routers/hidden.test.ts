/**
 * Item 2.7 (decision 0045) — what moderation hides. A hidden idea or
 * suggestion reads as removed to everyone but its writer and a moderator, is
 * no answer, and cannot be accepted or marked as helped; a hidden story is not
 * found for anyone but its authors and a moderator; "Show it again" undoes
 * it all, because nothing was deleted.
 *
 * Readers get the real request context (`createTRPCContext`, session mocked),
 * so a moderator's standing is what `actorFrom` makes of their grants.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { visibleStoryboardsWhere } from '@/lib/authz/guard'
import { ANSWERS } from '@/server/answers'
import { HIDDEN_TEXT } from '@/server/hidden'

let signedIn: { id: string; username: string } | null = null

vi.mock('@/auth', () => ({
  auth: async () =>
    signedIn
      ? { user: { id: signedIn.id, username: signedIn.username, onboarded: true }, expires: '' }
      : null,
}))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('hidden after a report (item 2.7)', () => {
  let db: PrismaClient
  const people: string[] = []
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner = { id: '', username: '' }
  let helper = { id: '', username: '' }
  let stranger = { id: '', username: '' }
  let moderator = { id: '', username: '' }
  let admin = { id: '', username: '' }
  let storyboardId = ''
  let slug = ''
  let requestPublicId = ''
  let requestId = ''
  let suggestionId = ''
  let suggestionPublicId = ''
  let ideaId = ''

  async function person(label: string, role: 'USER' | 'SUB_ADMIN' = 'USER') {
    const username = `hd-${label}-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date(), role },
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

  /** The admin as a hand-built context: the database allows one, and it stays whoever it is. */
  async function asTheAdmin() {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)({
      db,
      session: { user: { id: admin.id, username: admin.username, onboarded: true }, expires: '' },
      account: {
        status: 'ACTIVE',
        isAdmin: true,
        role: 'ADMIN' as const,
        grants: [],
        deletionRequestedAt: null,
        username: admin.username,
      },
      headers: new Headers(),
    })
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    helper = await person('helper')
    stranger = await person('stranger')
    admin = await person('admin')
    moderator = await person('mod', 'SUB_ADMIN')
    await db.subAdminGrant.create({
      data: { userId: moderator.id, capability: 'reports.decide', grantedById: admin.id },
    })

    slug = `hidden-${run}`
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `hd${run}`,
        slug,
        title: 'The hidden one',
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
    requestPublicId = `hdr${run}`
    const request = await db.contributionRequest.create({
      data: {
        publicId: requestPublicId,
        storyboardId,
        sectionId: section.id,
        openedById: owner.id,
        kind: 'UNBLOCK',
        state: 'ANSWERED',
        title: 'Stuck here',
        ask: 'Which way should this go?',
      },
      select: { id: true },
    })
    requestId = request.id
    suggestionPublicId = `hds${run}`
    const suggestion = await db.suggestion.create({
      data: {
        publicId: suggestionPublicId,
        requestId,
        contributorId: helper.id,
        baseRevisionId: revision.id,
        contentJson: { type: 'doc', content: [] },
        contentText: 'A suggestion with words in it.',
        wordCount: 6,
        note: 'A note to the author.',
        state: 'SUBMITTED',
        submittedAt: new Date(),
      },
      select: { id: true },
    })
    suggestionId = suggestion.id
    const idea = await db.idea.create({
      data: { requestId, authorId: helper.id, body: 'An idea that was reported.' },
      select: { id: true },
    })
    ideaId = idea.id
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      await tx.report.deleteMany({ where: { reporterId: { in: people } } })
      await tx.credit.deleteMany({ where: { storyboardId } })
      await tx.idea.deleteMany({ where: { requestId } })
      await tx.suggestion.deleteMany({ where: { requestId } })
      await tx.contributionRequest.deleteMany({ where: { storyboardId } })
      const sections = { chapter: { version: { storyboardId } } }
      await tx.section.updateMany({ where: sections, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { section: sections } })
      await tx.section.deleteMany({ where: sections })
      await tx.chapter.deleteMany({ where: { version: { storyboardId } } })
      await tx.version.deleteMany({ where: { storyboardId } })
      await tx.storyboard.deleteMany({ where: { id: storyboardId } })
      await tx.notification.deleteMany({ where: { userId: { in: people } } })
      await tx.activityDay.deleteMany({ where: { userId: { in: people } } })
      await tx.subAdminGrant.deleteMany({ where: { userId: { in: people } } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  it('reads as removed to a stranger, and as it was to its writer and a moderator', async () => {
    const call = await asTheAdmin()
    await call.admin.setHidden({
      targetType: 'IDEA',
      targetId: ideaId,
      hidden: true,
      reason: 'ABUSE',
    })
    await call.admin.setHidden({ targetType: 'SUGGESTION', targetId: suggestionId, hidden: true })

    const toStranger = await (await as(stranger)).request.get({ publicId: requestPublicId })
    expect(toStranger.ideas.find((idea) => idea.id === ideaId)).toMatchObject({
      body: HIDDEN_TEXT,
      hidden: true,
      redacted: true,
    })
    expect(toStranger.suggestions.find((row) => row.id === suggestionId)).toMatchObject({
      note: null,
      hidden: true,
      redacted: true,
    })
    const page = await (await as(stranger)).suggestion.get({ publicId: suggestionPublicId })
    expect(page.suggestion.contentText).toBe(HIDDEN_TEXT)
    expect(page.suggestion.note).toBeNull()
    await expect(
      (await as(stranger)).compare.suggestionAgainstHead({ suggestionId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    for (const who of [helper, moderator]) {
      const seen = await (await as(who)).request.get({ publicId: requestPublicId })
      expect(seen.ideas.find((idea) => idea.id === ideaId)).toMatchObject({
        body: 'An idea that was reported.',
        hidden: true,
        redacted: false,
      })
      expect(seen.suggestions.find((row) => row.id === suggestionId)?.note).toBe(
        'A note to the author.',
      )
      await expect(
        (await as(who)).compare.suggestionAgainstHead({ suggestionId }),
      ).resolves.toBeDefined()
    }
  })

  it('is no answer: it cannot be accepted or marked as helped, and the counts leave it out', async () => {
    const author = await as(owner)
    await expect(author.suggestion.accept({ suggestionId })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/removed after a report/u),
    })
    await expect(author.idea.markHelpful({ ideaId })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/removed after a report/u),
    })
    expect(await db.suggestion.count({ where: { requestId, ...ANSWERS } })).toBe(0)
    expect(await db.suggestion.count({ where: { id: suggestionId, hiddenAt: null } })).toBe(0)
  })

  it('hides a story from everyone but its authors and a moderator, and shows it again', async () => {
    const call = await asTheAdmin()
    await call.admin.setHidden({
      targetType: 'STORYBOARD',
      targetId: storyboardId,
      hidden: true,
      reason: 'PLAGIARISM',
    })

    for (const who of [stranger, null]) {
      await expect((await as(who)).storyboard.get({ slug })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    }
    const toOwner = await (await as(owner)).storyboard.get({ slug })
    expect(toOwner.storyboard.hiddenAt).not.toBeNull()
    expect(toOwner.storyboard.hiddenReason).toBe('PLAGIARISM')
    expect(toOwner.permissions.canEdit).toBe(true)
    const toModerator = await (await as(moderator)).storyboard.get({ slug })
    expect(toModerator.permissions.canEdit).toBe(false)
    expect(toModerator.permissions.canSubmitSuggestion).toBe(false)
    expect(
      await db.storyboard.count({ where: { id: storyboardId, ...visibleStoryboardsWhere(null) } }),
    ).toBe(0)

    await call.admin.setHidden({ targetType: 'STORYBOARD', targetId: storyboardId, hidden: false })
    await expect((await as(stranger)).storyboard.get({ slug })).resolves.toBeDefined()
    expect(
      await db.storyboard.count({ where: { id: storyboardId, ...visibleStoryboardsWhere(null) } }),
    ).toBe(1)
  })

  it('hides with the decision: "Uphold and hide" takes the report’s category as the reason', async () => {
    const call = await asTheAdmin()
    await call.admin.setHidden({ targetType: 'IDEA', targetId: ideaId, hidden: false })
    const report = await db.report.create({
      data: {
        reporterId: stranger.id,
        targetType: 'IDEA',
        targetId: ideaId,
        category: 'OFF_TOPIC',
      },
      select: { id: true },
    })

    const decided = await call.admin.decide({ reportId: report.id, decision: 'UPHELD', hide: true })
    expect(decided.hidden).toBe(true)
    expect(await db.idea.findUniqueOrThrow({ where: { id: ideaId } })).toMatchObject({
      hiddenReason: 'OFF_TOPIC',
      hiddenById: admin.id,
    })
    const queue = await call.admin.reports({ state: 'UPHELD' })
    expect(queue.reports.find((row) => row.id === report.id)?.subject.hidden).toBe(true)

    // A person is never hidden: an account is suspended, not hidden.
    const onPerson = await db.report.create({
      data: { reporterId: helper.id, targetType: 'USER', targetId: stranger.id, category: 'SPAM' },
      select: { id: true },
    })
    const plain = await call.admin.decide({ reportId: onPerson.id, decision: 'UPHELD', hide: true })
    expect(plain.hidden).toBe(false)
  })
})
