/**
 * Phase 14, item 8.12 (FR-13.6, D-11) — a proof anyone can check: the public
 * record of one saved version. Anyone with the address reads the record; the
 * story is named only to someone who may read that version; the PDF is the
 * writer's, and never for a restore. Through the router and the data layer
 * (`loadRevisionRecord`), against a real Postgres, so it skips when
 * DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

type Who = { id: string; username: string }

describe.skipIf(!databaseUrl)('the public record of a version (item 8.12)', () => {
  let db: PrismaClient
  const people: string[] = []
  const stories: string[] = []
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner: Who = { id: '', username: '' }
  let coauthor: Who = { id: '', username: '' }
  let reader: Who = { id: '', username: '' }
  let writer: Who = { id: '', username: '' }
  const ids = { authored: '', accepted: '', restored: '', beforePublic: '', secret: '' }
  let suggestionPublicId = ''

  async function person(label: string, displayName: string): Promise<Who> {
    const username = `pf-${label}-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, displayName },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

  async function as(who: Who | null) {
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

  /** A story with one section: the story's id and the section's. */
  async function story(title: string, visibility: 'PUBLIC' | 'PRIVATE', publicFrom: Date | null) {
    const tag = randomUUID().replaceAll('-', '').slice(0, 8)
    const row = await db.storyboard.create({
      data: {
        publicId: `pf${tag}`,
        slug: `proof-${tag}`,
        title,
        type: 'NOVEL',
        visibility,
        publicFrom,
        ownerId: owner.id,
        collaborators: {
          create: {
            userId: coauthor.id,
            invitedById: owner.id,
            role: 'COAUTHOR',
            acceptedAt: new Date(),
          },
        },
      },
      select: { id: true },
    })
    stories.push(row.id)
    const version = await db.version.create({
      data: { storyboardId: row.id, name: 'Main draft', isMain: true, createdById: owner.id },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0 },
      select: { id: true, lineageId: true },
    })
    return { storyboardId: row.id, sectionId: section.id, lineageId: section.lineageId }
  }

  async function revision(
    sectionId: string,
    data: {
      authorId: string
      source: 'AUTHORED' | 'ACCEPTED' | 'RESTORED'
      acceptedById?: string
      restoredFromId?: string
      suggestionId?: string
      createdAt?: Date
    },
  ) {
    const row = await db.revision.create({
      data: {
        sectionId,
        contentJson: { type: 'doc', content: [] },
        contentText: 'The harbour had been empty for a year.',
        wordCount: 8,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, 'a'),
        ...data,
      },
      select: { id: true },
    })
    return row.id
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner', 'Maya Owner')
    coauthor = await person('coauthor', 'Co Author')
    reader = await person('reader', 'A Reader')
    writer = await person('writer', 'Leah Writer')

    const wentPublic = new Date(Date.now() - 60 * 60 * 1000)
    const open = await story('The ship never lands', 'PUBLIC', wentPublic)
    ids.beforePublic = await revision(open.sectionId, {
      authorId: owner.id,
      source: 'AUTHORED',
      createdAt: new Date(wentPublic.getTime() - 60 * 60 * 1000),
    })
    ids.authored = await revision(open.sectionId, { authorId: owner.id, source: 'AUTHORED' })

    // Leah's suggestion, accepted: the version it became, and her credit.
    const request = await db.contributionRequest.create({
      data: {
        publicId: `pq${run}`,
        storyboardId: open.storyboardId,
        sectionId: open.sectionId,
        openedById: owner.id,
        kind: 'REWRITE',
        title: 'The harbour',
        ask: 'Make it quieter.',
        minWords: 1,
        maxWords: 100,
        state: 'RESOLVED',
      },
      select: { id: true },
    })
    const suggestion = await db.suggestion.create({
      data: {
        publicId: `ps${run}`,
        requestId: request.id,
        contributorId: writer.id,
        baseRevisionId: ids.authored,
        contentJson: { type: 'doc', content: [] },
        contentText: 'The harbour had been empty for a year.',
        state: 'ACCEPTED',
        submittedAt: new Date(),
        decidedAt: new Date(),
        decidedById: owner.id,
      },
      select: { id: true, publicId: true },
    })
    suggestionPublicId = suggestion.publicId
    ids.accepted = await revision(open.sectionId, {
      authorId: writer.id,
      acceptedById: owner.id,
      source: 'ACCEPTED',
      suggestionId: suggestion.id,
    })
    await db.credit.create({
      data: {
        storyboardId: open.storyboardId,
        contributorId: writer.id,
        type: 'PROSE',
        sectionLineage: open.lineageId,
        revisionId: ids.accepted,
        suggestionId: suggestion.id,
      },
    })
    ids.restored = await revision(open.sectionId, {
      authorId: owner.id,
      source: 'RESTORED',
      restoredFromId: ids.accepted,
    })

    const closed = await story('A diary nobody reads', 'PRIVATE', null)
    ids.secret = await revision(closed.sectionId, { authorId: owner.id, source: 'AUTHORED' })
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboardId: { in: stories } } } }
      await tx.credit.deleteMany({ where: { storyboardId: { in: stories } } })
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      // Children first: a restore points at what it copied, an accepted
      // version at its suggestion, and the suggestion at the version it was
      // written on.
      await tx.revision.deleteMany({ where: { section: where, restoredFromId: { not: null } } })
      await tx.revision.deleteMany({ where: { section: where, suggestionId: { not: null } } })
      await tx.suggestion.deleteMany({ where: { request: { storyboardId: { in: stories } } } })
      await tx.contributionRequest.deleteMany({ where: { storyboardId: { in: stories } } })
      await tx.revision.deleteMany({ where: { section: where } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboardId: { in: stories } } } })
      await tx.version.deleteMany({ where: { storyboardId: { in: stories } } })
      await tx.storyboard.deleteMany({ where: { id: { in: stories } } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  it('shows anyone the record, and a public story by name', async () => {
    const record = await (await as(null)).proof.get({ revisionId: ids.authored })
    expect(record.revision).toMatchObject({
      id: ids.authored,
      wordCount: 8,
      source: 'AUTHORED',
      author: { username: owner.username, displayName: 'Maya Owner' },
    })
    expect(record.revision.contentHash).toHaveLength(64)
    expect(record.story?.title).toBe('The ship never lands')
    // Nobody signed out is issued the PDF; the page offers it to the writer.
    expect(record.mayTakePdf).toBe(false)
    expect(record.revision).not.toHaveProperty('authorId')
  })

  it('names a private story only to the people who may read it', async () => {
    for (const who of [null, reader, writer]) {
      const record = await (await as(who)).proof.get({ revisionId: ids.secret })
      expect(record.story, who?.username ?? 'a guest').toBeNull()
      // The record itself is still there to check.
      expect(record.revision.wordCount).toBe(8)
    }
    for (const who of [owner, coauthor]) {
      const record = await (await as(who)).proof.get({ revisionId: ids.secret })
      expect(record.story?.title, who.username).toBe('A diary nobody reads')
    }
  })

  it('keeps a version written before the story went public to its authors (decision 0007)', async () => {
    expect((await (await as(reader)).proof.get({ revisionId: ids.beforePublic })).story).toBeNull()
    expect((await (await as(null)).proof.get({ revisionId: ids.beforePublic })).story).toBeNull()
    expect((await (await as(owner)).proof.get({ revisionId: ids.beforePublic })).story?.title).toBe(
      'The ship never lands',
    )
  })

  it('names both people on an accepted version, and issues the PDF to its writer only', async () => {
    const theirs = await (await as(writer)).proof.get({ revisionId: ids.accepted })
    expect(theirs.revision.author?.username).toBe(writer.username)
    expect(theirs.revision.acceptedBy?.username).toBe(owner.username)
    expect(theirs.mayTakePdf).toBe(true)
    expect((await (await as(owner)).proof.get({ revisionId: ids.accepted })).mayTakePdf).toBe(false)
  })

  it('points a restore at the version it copied, and offers nobody a proof of it', async () => {
    const restored = await (await as(owner)).proof.get({ revisionId: ids.restored })
    expect(restored.revision.source).toBe('RESTORED')
    expect(restored.revision.restoredFrom?.id).toBe(ids.accepted)
    // The owner restored it; the words are Leah's.
    expect(restored.mayTakePdf).toBe(false)
  })

  it('hands the writer, and only the writer, the way to it from their suggestion', async () => {
    const theirs = await (await as(writer)).suggestion.get({ publicId: suggestionPublicId })
    expect(theirs.proofRevisionId).toBe(ids.accepted)
    for (const who of [null, owner, reader]) {
      const seen = await (await as(who)).suggestion.get({ publicId: suggestionPublicId })
      expect(seen.proofRevisionId, who?.username ?? 'a guest').toBeNull()
      expect(seen.suggestion).not.toHaveProperty('revision')
    }
  })

  it('hands the writer, and only the writer, the way to it from their profile', async () => {
    const own = await (await as(writer)).profile.byUsername({ username: writer.username })
    expect(own.credits.map((credit) => credit.proofRevisionId)).toEqual([ids.accepted])
    const visitor = await (await as(null)).profile.byUsername({ username: writer.username })
    expect(visitor.credits.map((credit) => credit.proofRevisionId)).toEqual([null])
    expect(visitor.credits[0]).not.toHaveProperty('revisionId')
  })

  it('answers a missing record with a sentence', async () => {
    await expect((await as(null)).proof.get({ revisionId: 'no-such-version' })).rejects.toThrow(
      new TRPCError({ code: 'NOT_FOUND', message: 'There is no record at this address.' }),
    )
  })
})
