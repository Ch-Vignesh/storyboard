/**
 * Database-level invariants. These need a real Postgres with migrations
 * applied (`pnpm db:deploy`), so they are skipped when DATABASE_URL is unset.
 * CI always runs them against a service container.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createPrismaClient } from '../client'
import type { PrismaClient } from '../generated/prisma/client'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('database invariants', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 10)
  let userId = ''
  let storyboardId = ''
  let sectionId = ''
  let revisionId = ''

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    const user = await db.user.create({
      data: {
        email: `invariants-${run}@example.test`,
        username: `inv_${run}`,
        displayName: 'Invariants',
      },
    })
    userId = user.id
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `p${run}`,
        slug: `invariants-${run}`,
        title: 'Invariants',
        type: 'NOVEL',
        ownerId: userId,
      },
    })
    storyboardId = storyboard.id
    const version = await db.version.create({
      data: { storyboardId, name: 'Main draft', isMain: true, createdById: userId },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0 },
    })
    sectionId = section.id
    const revision = await db.revision.create({
      data: {
        sectionId,
        contentJson: { type: 'doc', content: [] },
        contentText: 'It was a dark and stormy night.',
        wordCount: 7,
        contentHash: 'test',
        source: 'AUTHORED',
        authorId: userId,
      },
    })
    revisionId = revision.id
    await db.section.update({
      where: { id: sectionId },
      data: { currentRevisionId: revisionId, wordCount: 7 },
    })
  })

  afterAll(async () => {
    // Cleanup goes through the one sanctioned escape hatch, because revisions refuse DELETE.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('storyboard.hard_delete', 'on', true)`
      await tx.section.update({ where: { id: sectionId }, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { sectionId } })
      await tx.storyboard.delete({ where: { id: storyboardId } })
      await tx.user.delete({ where: { id: userId } })
    })
    await db.$disconnect()
  })

  it('refuses UPDATE on a revision (NFR-3)', async () => {
    await expect(
      db.revision.update({ where: { id: revisionId }, data: { contentText: 'tampered' } }),
    ).rejects.toThrow(/immutable/)
  })

  it('refuses DELETE on a revision outside the hard-delete escape hatch (NFR-3)', async () => {
    await expect(db.revision.delete({ where: { id: revisionId } })).rejects.toThrow(/immutable/)
  })

  it('allows exactly one main version per storyboard (FR-10.2)', async () => {
    await expect(
      db.version.create({
        data: { storyboardId, name: 'Second main', isMain: true, createdById: userId },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
    const alternate = await db.version.create({
      data: { storyboardId, name: 'Alternate', isMain: false, createdById: userId },
    })
    expect(alternate.isMain).toBe(false)
  })

  it('allows at most one open request per section (FR-5.1)', async () => {
    const base = {
      storyboardId,
      sectionId,
      kind: 'UNBLOCK',
      ask: 'Where does this scene go?',
      openedById: userId,
    } as const
    const first = await db.contributionRequest.create({
      data: { ...base, publicId: `r1${run}`, title: 'Stuck' },
    })
    await expect(
      db.contributionRequest.create({
        data: { ...base, publicId: `r2${run}`, title: 'Stuck again' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
    await db.contributionRequest.update({
      where: { id: first.id },
      data: { state: 'CLOSED', closedAt: new Date() },
    })
    const second = await db.contributionRequest.create({
      data: { ...base, publicId: `r3${run}`, title: 'Stuck, take two' },
    })
    expect(second.state).toBe('OPEN')
  })
})
