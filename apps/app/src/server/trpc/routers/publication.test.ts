/**
 * Phase 14, items 7b.1 and 7b.2 (decision 0044) — publishing. The owner
 * publishes the main draft as a numbered, frozen edition; publishing again
 * makes the next number and leaves the first readable; nothing writes into an
 * edition; a co-author cannot publish; a story with nothing in it cannot be
 * published; an edition is not listed with the alternates; and a private
 * story's editions are as private as the story.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('publishing (items 7b.1 and 7b.2)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  const people: string[] = []
  let owner = { id: '', username: '' }
  let coauthor = { id: '', username: '' }
  let stranger = { id: '', username: '' }
  let storyboardId = ''
  let slug = ''
  let sectionId = ''
  let revisionId = ''

  async function person(label: string) {
    const username = `pb-${label}-${run}`
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

  const doc = (text: string) => ({
    type: 'doc' as const,
    content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }],
  })

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    coauthor = await person('coauthor')
    stranger = await person('stranger')
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `pb${run}`,
        slug: `published-${run}`,
        title: 'Editions',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: owner.id,
        collaborators: {
          create: { userId: coauthor.id, invitedById: owner.id, acceptedAt: new Date() },
        },
      },
      select: { id: true, slug: true },
    })
    storyboardId = storyboard.id
    slug = storyboard.slug
    const version = await db.version.create({
      data: { storyboardId, name: 'Main draft', isMain: true, createdById: owner.id },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 0 },
      select: { id: true },
    })
    sectionId = section.id
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboardId } } }
      await tx.publication.deleteMany({ where: { storyboardId } })
      await tx.auditEvent.deleteMany({ where: { storyboardId } })
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      await tx.sectionDraft.deleteMany({ where: { section: where } })
      await tx.revision.deleteMany({ where: { section: where } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboardId } } })
      await tx.version.deleteMany({ where: { storyboardId } })
      await tx.collaborator.deleteMany({ where: { storyboardId } })
      await tx.storyboard.deleteMany({ where: { id: storyboardId } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  it('refuses to publish a story with nothing in it', async () => {
    await expect((await as(owner)).publication.publish({ storyboardId })).rejects.toThrow(
      /nothing to publish yet/u,
    )
  })

  it('publishes numbered editions, and keeps the first readable', async () => {
    const author = await as(owner)
    const first = await author.section.commitRevision({
      sectionId,
      contentJson: doc('The harbour had been empty for a year.'),
      baseRevisionId: null,
    })
    revisionId = first.revisionId ?? ''
    expect(await author.publication.publish({ storyboardId, note: 'The first.' })).toEqual({
      number: 1,
    })

    await author.section.commitRevision({
      sectionId,
      contentJson: doc('The harbour filled overnight.'),
      baseRevisionId: revisionId,
    })
    expect(await author.publication.publish({ storyboardId })).toEqual({ number: 2 })

    const reader = await as(null)
    const one = await reader.publication.get({ slug, number: 1 })
    expect(one).toMatchObject({ number: 1, note: 'The first.', current: false })
    const current = await reader.publication.get({ slug })
    expect(current).toMatchObject({ number: 2, current: true })

    // The first edition still reads as it was published.
    const data = await reader.storyboard.get({ slug, versionId: one.versionId })
    expect(data.version.edition).toBe(1)
    const [chapter] = data.chapters
    const sections = await reader.section.listForChapter({ chapterId: chapter!.id })
    expect(JSON.stringify(sections[0]?.currentRevision?.contentJson)).toContain('empty for a year')
  })

  it('refuses every write into an edition', async () => {
    const reader = await as(null)
    const one = await reader.publication.get({ slug, number: 1 })
    const data = await reader.storyboard.get({ slug, versionId: one.versionId })
    const frozenSection = data.chapters[0]!.sections[0]!.id
    const author = await as(owner)
    await expect(
      author.section.commitRevision({
        sectionId: frozenSection,
        contentJson: doc('Changed.'),
        baseRevisionId: null,
      }),
    ).rejects.toThrow(/This is a published edition/u)
    await expect(
      author.version.rename({ versionId: one.versionId, name: 'Renamed' }),
    ).rejects.toThrow(/This is a published edition/u)
    await expect(author.version.promoteToMain({ versionId: one.versionId })).rejects.toThrow(
      /This is a published edition/u,
    )
  })

  it('lists editions apart from the alternates', async () => {
    const { versions } = await (await as(owner)).version.list({ storyboardId })
    expect(versions.map((version) => version.name)).toEqual(['Main draft'])
    const { editions, canPublish } = await (await as(owner)).publication.list({ storyboardId })
    expect(editions.map((edition) => edition.number)).toEqual([2, 1])
    expect(canPublish).toBe(true)
  })

  it('is the owner’s to do: a co-author cannot publish', async () => {
    await expect((await as(coauthor)).publication.publish({ storyboardId })).rejects.toBeInstanceOf(
      TRPCError,
    )
    expect((await (await as(coauthor)).publication.list({ storyboardId })).canPublish).toBe(false)
  })

  it('keeps a private story’s editions as private as the story', async () => {
    await db.storyboard.update({ where: { id: storyboardId }, data: { visibility: 'PRIVATE' } })
    await expect((await as(stranger)).publication.get({ slug })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect((await as(null)).publication.get({ slug, number: 1 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await db.storyboard.update({ where: { id: storyboardId }, data: { visibility: 'PUBLIC' } })
  })

  it('tells the original’s authors when a public spin-off publishes, and only then (7b.4)', async () => {
    // The stranger's spin-off of this story, with words in it.
    const spinOff = await db.storyboard.create({
      data: {
        publicId: `ps${run}`,
        slug: `published-spin-off-${run}`,
        title: 'Their own version',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: stranger.id,
        forkedFromId: storyboardId,
        forkedAt: new Date(),
      },
      select: { id: true, slug: true },
    })
    const version = await db.version.create({
      data: {
        storyboardId: spinOff.id,
        name: 'Main draft',
        isMain: true,
        createdById: stranger.id,
      },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 0 },
      select: { id: true },
    })
    const theirs = await as(stranger)
    await theirs.section.commitRevision({
      sectionId: section.id,
      contentJson: doc('The lighthouse stopped turning.'),
      baseRevisionId: null,
    })
    const told = () =>
      db.notification.findMany({
        where: { userId: owner.id, type: 'SPIN_OFF_PUBLISHED' },
        select: { payload: true },
      })

    try {
      await theirs.publication.publish({ storyboardId: spinOff.id })
      const rows = await told()
      expect(rows).toHaveLength(1)
      expect(rows[0]?.payload).toEqual({ storyboardId: spinOff.id, number: '1' })
      // The row leads the original's author to the edition.
      const { items } = await (await as(owner)).notification.list({})
      const row = items.find((item) => item.type === 'SPIN_OFF_PUBLISHED')
      expect(row?.path).toBe(`/s/${spinOff.slug}/published/1`)

      // A private spin-off's edition is nobody's news.
      await db.storyboard.update({ where: { id: spinOff.id }, data: { visibility: 'PRIVATE' } })
      await theirs.publication.publish({ storyboardId: spinOff.id })
      expect(await told()).toHaveLength(1)
    } finally {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
        const where = { chapter: { version: { storyboardId: spinOff.id } } }
        await tx.notification.deleteMany({ where: { userId: owner.id } })
        await tx.publication.deleteMany({ where: { storyboardId: spinOff.id } })
        await tx.auditEvent.deleteMany({ where: { storyboardId: spinOff.id } })
        await tx.section.updateMany({ where, data: { currentRevisionId: null } })
        await tx.revision.deleteMany({ where: { section: where } })
        await tx.section.deleteMany({ where })
        await tx.chapter.deleteMany({ where: { version: { storyboardId: spinOff.id } } })
        await tx.version.deleteMany({ where: { storyboardId: spinOff.id } })
        await tx.storyboard.delete({ where: { id: spinOff.id } })
      })
    }
  })
})
