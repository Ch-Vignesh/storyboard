/**
 * FR-2.6's purge, and the one thing it must not do.
 *
 * Decision 0014 let two sections share one head revision, and `copyTree` uses
 * that for spin-offs as well as for alternate versions — so a spin-off's
 * sections point at the *original storyboard's* revisions.
 * `Section.currentRevisionId` is `ON DELETE SET NULL`. If the purge deletes a
 * revision a spin-off still points at, that spin-off loses its manuscript:
 * silently, thirty days after somebody else pressed delete, to a person who did
 * nothing.
 *
 * That is the test below. Everything else here is ordinary.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { copyTree } from '@/server/tree'

import { purgeDeletedStoryboards } from './index'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('purging a deleted storyboard (FR-2.6)', () => {
  let db: PrismaClient
  const made: string[] = []

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterEach(async () => {
    if (made.length === 0) return
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboard: { ownerId: { in: made } } } } }
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      await tx.credit.updateMany({
        where: { storyboard: { ownerId: { in: made } } },
        data: { revisionId: null },
      })
      await tx.revision.deleteMany({ where: { section: where } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboard: { ownerId: { in: made } } } } })
      await tx.version.deleteMany({ where: { storyboard: { ownerId: { in: made } } } })
      await tx.credit.deleteMany({ where: { storyboard: { ownerId: { in: made } } } })
      await tx.storyboard.deleteMany({ where: { ownerId: { in: made } } })
      await tx.user.deleteMany({ where: { id: { in: made } } })
    })
    made.length = 0
  })

  /** A person, a storyboard, one written section. Returns what the tests need. */
  async function writeSomething(label: string) {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const user = await db.user.create({
      data: { email: `purge-${label}-${run}@example.test`, username: `pg_${label}_${run}` },
      select: { id: true },
    })
    made.push(user.id)

    const storyboard = await db.storyboard.create({
      data: {
        publicId: `pg${run}`,
        slug: `purge-${label}-${run}`,
        title: `Purge ${label}`,
        type: 'NOVEL',
        visibility: 'PUBLIC',
        ownerId: user.id,
      },
      select: { id: true },
    })
    const version = await db.version.create({
      data: { storyboardId: storyboard.id, name: 'Main draft', isMain: true, createdById: user.id },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 7 },
      select: { id: true, lineageId: true },
    })
    const revision = await db.revision.create({
      data: {
        sectionId: section.id,
        contentJson: { type: 'doc', content: [] },
        contentText: 'The harbour had been empty for a year.',
        wordCount: 7,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: user.id,
      },
      select: { id: true },
    })
    await db.section.update({
      where: { id: section.id },
      data: { currentRevisionId: revision.id },
    })

    return { user, storyboard, version, chapter, section, revision }
  }

  /** Deletes a storyboard and backdates it past the grace period. */
  async function deleteAndAge(storyboardId: string) {
    await db.storyboard.update({
      where: { id: storyboardId },
      data: { deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), state: 'DELETED' },
    })
  }

  it('leaves a storyboard still inside its grace period alone', async () => {
    const { storyboard, section } = await writeSomething('grace')
    await db.storyboard.update({
      where: { id: storyboard.id },
      data: { deletedAt: new Date(), state: 'DELETED' },
    })

    await purgeDeletedStoryboards(db)

    expect(await db.storyboard.findUnique({ where: { id: storyboard.id } })).not.toBeNull()
    expect(await db.section.findUnique({ where: { id: section.id } })).not.toBeNull()
  })

  it('removes one past its grace period, prose and all', async () => {
    const { storyboard, section, revision } = await writeSomething('gone')
    await deleteAndAge(storyboard.id)

    const result = await purgeDeletedStoryboards(db)
    expect(result.purged).toBeGreaterThanOrEqual(1)

    expect(await db.storyboard.findUnique({ where: { id: storyboard.id } })).toBeNull()
    expect(await db.section.findUnique({ where: { id: section.id } })).toBeNull()
    expect(await db.revision.findUnique({ where: { id: revision.id } })).toBeNull()
  })

  /**
   * Found in the phase 12 audit: every storyboard that had ever accepted a
   * suggestion failed its purge, every night, for ever. Deleting the suggestion
   * made Postgres null `Revision.suggestionId` on the accepted revision, which
   * is an UPDATE, which NFR-3's trigger refuses even inside the hard-delete
   * hatch. The prose a writer deleted was kept indefinitely (FR-2.6).
   */
  it('removes one that accepted a suggestion, with its history chain', async () => {
    const { user, storyboard, section, revision } = await writeSomething('accepted')
    const run = randomUUID().replaceAll('-', '').slice(0, 8)

    const request = await db.contributionRequest.create({
      data: {
        publicId: `rq${run}`,
        storyboardId: storyboard.id,
        sectionId: section.id,
        kind: 'REWRITE',
        title: 'Tighten the opening',
        ask: 'Shorter, please.',
        state: 'RESOLVED',
        openedById: user.id,
      },
      select: { id: true },
    })
    const suggestion = await db.suggestion.create({
      data: {
        publicId: `sg${run}`,
        requestId: request.id,
        contributorId: user.id,
        baseRevisionId: revision.id,
        contentJson: { type: 'doc', content: [] },
        contentText: 'The harbour was empty.',
        wordCount: 4,
        state: 'ACCEPTED',
      },
      select: { id: true },
    })
    // What `suggestion.accept` leaves behind: a revision made from it, on top
    // of the one it was written against.
    const accepted = await db.revision.create({
      data: {
        sectionId: section.id,
        parentId: revision.id,
        contentJson: { type: 'doc', content: [] },
        contentText: 'The harbour was empty.',
        wordCount: 4,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '1'),
        source: 'ACCEPTED',
        authorId: user.id,
        acceptedById: user.id,
        suggestionId: suggestion.id,
      },
      select: { id: true },
    })
    await db.section.update({
      where: { id: section.id },
      data: { currentRevisionId: accepted.id },
    })
    await deleteAndAge(storyboard.id)

    const result = await purgeDeletedStoryboards(db)

    expect(await db.storyboard.findUnique({ where: { id: storyboard.id } })).toBeNull()
    expect(await db.revision.findUnique({ where: { id: accepted.id } })).toBeNull()
    expect(await db.suggestion.findUnique({ where: { id: suggestion.id } })).toBeNull()
    expect(result.purged).toBeGreaterThanOrEqual(1)
  })

  it('does not touch a storyboard nobody deleted', async () => {
    const { storyboard } = await writeSomething('alive')
    await purgeDeletedStoryboards(db)
    expect(await db.storyboard.findUnique({ where: { id: storyboard.id } })).not.toBeNull()
  })

  /**
   * The one that matters. A spin-off shares the original's head revision
   * (decision 0014, `copyTree`), and `Section.currentRevisionId` is
   * `ON DELETE SET NULL` — so deleting that revision empties the spin-off.
   */
  it('leaves a spin-off with its prose when the original is purged', async () => {
    const origin = await writeSomething('origin')

    const spinner = await db.user.create({
      data: {
        email: `purge-spinner-${randomUUID().slice(0, 8)}@example.test`,
        username: `pg_sp_${randomUUID().replaceAll('-', '').slice(0, 8)}`,
      },
      select: { id: true },
    })
    made.push(spinner.id)

    const spinOff = await db.storyboard.create({
      data: {
        publicId: `sp${randomUUID().replaceAll('-', '').slice(0, 8)}`,
        slug: `purge-spinoff-${randomUUID().slice(0, 8)}`,
        title: 'Somebody else’s book now',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        ownerId: spinner.id,
        forkedFromId: origin.storyboard.id,
        forkedAt: new Date(),
      },
      select: { id: true },
    })
    const spinVersion = await db.version.create({
      data: { storyboardId: spinOff.id, name: 'Main draft', isMain: true, createdById: spinner.id },
      select: { id: true },
    })

    // Through the real code path: this is exactly what `spinOff.create` does.
    await copyTree(db, origin.version.id, spinVersion.id, { copyRevisions: true })

    const spinSection = await db.section.findFirstOrThrow({
      where: { chapter: { versionId: spinVersion.id } },
      select: { id: true, currentRevisionId: true },
    })

    // The copy is its own row, not the original's (decision 0019) — but the
    // same words, and the same hash, so FR-13.6's proof still checks out.
    expect(spinSection.currentRevisionId).not.toBe(origin.revision.id)
    const copied = await db.revision.findUniqueOrThrow({
      where: { id: spinSection.currentRevisionId ?? '' },
      select: { contentHash: true, authorId: true },
    })
    const source = await db.revision.findUniqueOrThrow({
      where: { id: origin.revision.id },
      select: { contentHash: true, authorId: true },
    })
    expect(copied.contentHash).toBe(source.contentHash)
    expect(copied.authorId).toBe(source.authorId)

    await deleteAndAge(origin.storyboard.id)
    await purgeDeletedStoryboards(db)

    // The original is gone, as asked.
    expect(await db.storyboard.findUnique({ where: { id: origin.storyboard.id } })).toBeNull()

    // The spin-off is not, and neither is its manuscript.
    const after = await db.section.findUnique({
      where: { id: spinSection.id },
      select: { currentRevisionId: true, currentRevision: { select: { contentText: true } } },
    })
    expect(after).not.toBeNull()
    expect(after?.currentRevisionId, 'the spin-off lost its head revision').not.toBeNull()
    expect(after?.currentRevision?.contentText).toBe('The harbour had been empty for a year.')
  })
})
