/**
 * Phase 4 — what the database must guarantee about versions and spin-offs.
 *
 * Three claims the application leans on and cannot check itself:
 *
 * 1. Two sections may share one head revision (decision 0014). A copied version
 *    starts identical to its base; copying the prose instead would break the
 *    "revisions are immutable and shared" rule in architecture section 2.2.
 * 2. Exactly one version of a storyboard is the main draft — enforced by the
 *    partial unique index, not by whoever remembers to swap both rows.
 * 3. A spin-off's inherited credits survive the original being deleted. FR-9.5
 *    promises credit that travels; a foreign key that cascaded would quietly
 *    break that promise the first time an author deleted their storyboard.
 *
 * Needs a real Postgres with migrations applied, so it skips when DATABASE_URL
 * is unset. CI always runs them.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createPrismaClient } from '../client'
import type { PrismaClient } from '../generated/prisma/client'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('versions and spin-offs', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 10)
  let userId = ''
  let storyboardId = ''
  let mainVersionId = ''
  let sectionId = ''
  let revisionId = ''

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })

    const user = await db.user.create({
      data: {
        email: `versions-${run}@example.test`,
        username: `ver_${run}`,
        displayName: 'Versions',
      },
      select: { id: true },
    })
    userId = user.id

    const storyboard = await db.storyboard.create({
      data: {
        publicId: `ver${run}`,
        slug: `versions-${run}`,
        title: 'The ship never lands',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        ownerId: userId,
      },
      select: { id: true },
    })
    storyboardId = storyboard.id

    const version = await db.version.create({
      data: { storyboardId, name: 'Main draft', isMain: true, createdById: userId },
      select: { id: true },
    })
    mainVersionId = version.id

    const chapter = await db.chapter.create({
      data: { versionId: mainVersionId, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0 },
      select: { id: true },
    })
    sectionId = section.id

    const revision = await db.revision.create({
      data: {
        sectionId,
        contentJson: { type: 'doc', content: [] },
        contentText: 'The ship never lands.',
        wordCount: 4,
        contentHash: 'ship'.padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: userId,
      },
      select: { id: true },
    })
    revisionId = revision.id
    await db.section.update({
      where: { id: sectionId },
      data: { currentRevisionId: revisionId },
    })
  })

  afterAll(async () => {
    if (!userId) return
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      await tx.section.updateMany({
        where: { chapter: { version: { storyboard: { ownerId: userId } } } },
        data: { currentRevisionId: null },
      })
      await tx.revision.deleteMany({
        where: { section: { chapter: { version: { storyboard: { ownerId: userId } } } } },
      })
    })
    await db.credit.deleteMany({ where: { storyboard: { ownerId: userId } } })
    await db.storyboard.deleteMany({ where: { ownerId: userId } })
    await db.user.delete({ where: { id: userId } })
    await db.$disconnect()
  })

  /** Decision 0014 — the bug that made copying a version impossible. */
  it('lets a copied section share the head revision of the one it came from', async () => {
    const copyVersion = await db.version.create({
      data: { storyboardId, name: 'The other chapter four', isMain: false, createdById: userId },
      select: { id: true },
    })
    const copyChapter = await db.chapter.create({
      data: { versionId: copyVersion.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })

    const copy = await db.section.create({
      data: {
        chapterId: copyChapter.id,
        // The lineage is carried across: that is what pairs the two sections
        // when the versions are compared (FR-7.5).
        lineageId: (
          await db.section.findUniqueOrThrow({
            where: { id: sectionId },
            select: { lineageId: true },
          })
        ).lineageId,
        order: 0,
        currentRevisionId: revisionId,
      },
      select: { id: true, currentRevisionId: true },
    })

    expect(copy.currentRevisionId).toBe(revisionId)

    // Both sections point at one revision, and neither has been copied.
    const sharing = await db.section.count({ where: { currentRevisionId: revisionId } })
    expect(sharing).toBe(2)
  })

  it('refuses a second main version of the same storyboard', async () => {
    await expect(
      db.version.create({
        data: { storyboardId, name: 'Also main', isMain: true, createdById: userId },
      }),
    ).rejects.toThrow()
  })

  it('allows the main draft to move to another version', async () => {
    const alternate = await db.version.create({
      data: { storyboardId, name: 'Promote me', isMain: false, createdById: userId },
      select: { id: true },
    })

    // FR-10.2 — the swap is one transaction, or the index refuses it halfway.
    await db.$transaction([
      db.version.update({ where: { id: mainVersionId }, data: { isMain: false } }),
      db.version.update({ where: { id: alternate.id }, data: { isMain: true } }),
    ])

    const mains = await db.version.findMany({
      where: { storyboardId, isMain: true },
      select: { id: true },
    })
    expect(mains).toHaveLength(1)
    expect(mains[0]?.id).toBe(alternate.id)

    // Put it back so the rest of the file reads the way it was written.
    await db.$transaction([
      db.version.update({ where: { id: alternate.id }, data: { isMain: false } }),
      db.version.update({ where: { id: mainVersionId }, data: { isMain: true } }),
    ])
  })

  /** FR-9.5 — credit that travels, and keeps travelling. */
  it('keeps an inherited credit after the credit it came from is deleted', async () => {
    const original = await db.credit.create({
      data: {
        storyboardId,
        contributorId: userId,
        type: 'PROSE',
        sectionLineage: randomUUID(),
        revisionId,
        isLive: true,
      },
      select: { id: true },
    })

    const spinOff = await db.storyboard.create({
      data: {
        publicId: `spn${run}`,
        slug: `spin-off-${run}`,
        title: 'The ship lands',
        type: 'NOVEL',
        visibility: 'PRIVATE',
        ownerId: userId,
        forkedFromId: storyboardId,
        forkedAt: new Date(),
      },
      select: { id: true },
    })

    const inherited = await db.credit.create({
      data: {
        storyboardId: spinOff.id,
        contributorId: userId,
        type: 'PROSE',
        sectionLineage: randomUUID(),
        revisionId,
        isLive: true,
        inheritedFromId: original.id,
      },
      select: { id: true },
    })

    await db.credit.delete({ where: { id: original.id } })

    const after = await db.credit.findUnique({
      where: { id: inherited.id },
      select: { id: true, contributorId: true, inheritedFromId: true },
    })
    expect(after).not.toBeNull()
    expect(after?.contributorId).toBe(userId)
    // The pointer is nulled rather than the row taken with it.
    expect(after?.inheritedFromId).toBeNull()
  })
})
