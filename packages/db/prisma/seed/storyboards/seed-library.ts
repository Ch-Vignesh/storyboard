import { randomUUID } from 'node:crypto'

import type { PrismaClient } from '../../../src/generated/prisma/client'
import { ensureSeedAccounts, type SeedAccounts } from './accounts'
import { LIBRARY, type SeedWork } from './library'
import { deriveOf, docOf, paragraphsOf } from './prose'
import { ensureRequests, type RequestsAdded, type Tx } from './requests'

/**
 * Seeding the library (FR-15.1 to FR-15.4, FR-15.6).
 *
 * Idempotent, keyed on each work's `publicId`: running it twice creates
 * nothing. Everything it creates is `isSeed: true` and owned by the platform
 * account, which has no password and cannot be signed into (FR-15.3).
 *
 * FR-15.1 is the reason this exists in the shape it does: **seed the request
 * side, not the helper side.** A visitor who arrives to forty open requests and
 * no answers sees a place that needs them. A visitor who arrives to forty
 * answered requests sees a place that does not. So most of what is seeded here
 * is somebody stuck, and the answered ones are there only to show what the loop
 * looks like when it closes (FR-15.4).
 *
 * A work a database already has is brought up to the library, never back:
 * corrected prose (decision 0023), then since item 9.5 the sections added to
 * its end and the requests and help added to it, each made only where it is
 * missing. A work deleted and waiting for its purge is left as it is.
 */

function slugify(title: string): string {
  return (
    title
      .normalize('NFKD')
      .toLowerCase()
      .replaceAll(/[^\w\s-]+/gu, '')
      .trim()
      .replaceAll(/\s+/gu, '-')
      .slice(0, 60) || 'story'
  )
}

export type LibraryResult = {
  created: number
  skipped: number
  requests: number
  answered: number
  /** Sections whose text was corrected on a database that already had them. */
  corrected: number
  /** Item 9.5 — sections added to the end of works a database already had. */
  extended: number
  /** D-14 — suggestions and ideas from the example helpers, made on this run. */
  help: number
  /** Requests whose section is already asked about, so not made (FR-5.1). */
  unplaced: string[]
}

export async function seedLibrary(
  prisma: PrismaClient,
  accounts?: SeedAccounts,
  /** The works to seed: the library, or a test's own. */
  library: readonly SeedWork[] = LIBRARY,
): Promise<LibraryResult> {
  const owners = accounts ?? (await ensureSeedAccounts(prisma))

  const result: LibraryResult = {
    created: 0,
    skipped: 0,
    requests: 0,
    answered: 0,
    corrected: 0,
    extended: 0,
    help: 0,
    unplaced: [],
  }
  const count = (work: SeedWork, added: RequestsAdded) => {
    result.requests += added.requests
    result.answered += added.answered
    result.help += added.help
    result.unplaced.push(...added.unplaced.map((title) => `${work.title}: ${title}`))
  }

  for (const work of library) {
    const existing = await prisma.storyboard.findUnique({
      where: { publicId: work.publicId },
      select: { id: true, deletedAt: true },
    })

    if (!existing) {
      count(work, await seedOne(prisma, work, owners))
      result.created += 1
      continue
    }

    result.skipped += 1
    // On its way out: deleted, and waiting for the purge (FR-2.6). Nothing is
    // corrected or added, so a seed run never puts anything back on a story
    // somebody chose to remove.
    if (existing.deletedAt) continue

    result.corrected += await reconcileText(prisma, work, existing.id, owners.platformId)

    const grown = await prisma.$transaction(async (tx) => {
      const { added, sections } = await ensureSections(tx, work, existing.id, owners.platformId)
      return {
        added,
        requests: await ensureRequests(tx, {
          storyboardId: existing.id,
          accounts: owners,
          requests: work.requests,
          sections: [sections],
        }),
      }
    })
    result.extended += grown.added
    count(work, grown.requests)
  }

  return result
}

/**
 * Bring an already-seeded work's prose back in line with the library.
 *
 * Idempotency by existence alone has a hole that phase 8 walked into: once a
 * work is seeded, editing the library never reaches the database again. So the
 * thirteen misquotations `pnpm check-excerpts` found (decision 0023) were fixed
 * in the file and stayed wrong in every database that had already been seeded —
 * including, had this gone unnoticed, production, permanently.
 *
 * The correction is written as a **new revision**, not an update. Revisions are
 * append-only and a trigger enforces it (NFR-3), so this is not a workaround:
 * it is the same thing the product does when an author edits a section, and it
 * leaves the wrong text visible in the history where it belongs.
 *
 * Only seeded works, only where the text actually differs, and only when the
 * current revision is one the platform wrote. If a contributor's accepted
 * suggestion is what stands there now, that is somebody's work and a seed
 * script does not touch it.
 */
async function reconcileText(
  prisma: PrismaClient,
  work: SeedWork,
  storyboardId: string,
  platformId: string,
): Promise<number> {
  const sections = await prisma.section.findMany({
    where: {
      chapter: { version: { storyboardId, isMain: true } },
      deletedAt: null,
    },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      order: true,
      currentRevision: { select: { id: true, contentText: true, authorId: true, source: true } },
    },
  })

  let corrected = 0

  for (const [index, wanted] of work.chapter.sections.entries()) {
    const section = sections.find((candidate) => candidate.order === index)
    const current = section?.currentRevision
    if (!section || !current) continue

    const paragraphs = paragraphsOf(wanted)
    const derived = deriveOf(paragraphs)
    if (current.contentText === derived.contentText) continue

    // Somebody else's prose stands here now. Leave it alone.
    if (current.source !== 'AUTHORED' || current.authorId !== platformId) continue

    await prisma.$transaction(async (tx) => {
      const revision = await tx.revision.create({
        data: {
          sectionId: section.id,
          parentId: current.id,
          contentJson: docOf(paragraphs),
          ...derived,
          source: 'AUTHORED',
          authorId: platformId,
        },
        select: { id: true },
      })
      await tx.section.update({
        where: { id: section.id },
        data: { currentRevisionId: revision.id, wordCount: derived.wordCount },
      })
    })
    corrected += 1
  }

  return corrected
}

/**
 * Item 9.5 — the sections a work gained after a database was seeded, added at
 * the end of its chapter, where the library puts them. Returns every section
 * id in order, for the requests to find their section by.
 */
async function ensureSections(
  tx: Tx,
  work: SeedWork,
  storyboardId: string,
  platformId: string,
): Promise<{ added: number; sections: string[] }> {
  const chapter = await tx.chapter.findFirstOrThrow({
    where: { order: 0, deletedAt: null, version: { storyboardId, isMain: true } },
    select: {
      id: true,
      sections: { where: { deletedAt: null }, select: { id: true, order: true } },
    },
  })

  let added = 0
  const sections: string[] = []
  for (const [index, text] of work.chapter.sections.entries()) {
    const found = chapter.sections.find((candidate) => candidate.order === index)
    if (found) {
      sections.push(found.id)
      continue
    }
    sections.push(await createSection(tx, chapter.id, index, text, platformId))
    added += 1
  }
  return { added, sections }
}

async function createSection(
  tx: Tx,
  chapterId: string,
  order: number,
  text: string,
  platformId: string,
): Promise<string> {
  const paragraphs = paragraphsOf(text)
  const derived = deriveOf(paragraphs)

  const section = await tx.section.create({
    data: { chapterId, lineageId: randomUUID(), order, wordCount: derived.wordCount },
    select: { id: true },
  })
  const revision = await tx.revision.create({
    data: {
      sectionId: section.id,
      contentJson: docOf(paragraphs),
      ...derived,
      source: 'AUTHORED',
      authorId: platformId,
    },
    select: { id: true },
  })
  await tx.section.update({
    where: { id: section.id },
    data: { currentRevisionId: revision.id },
  })
  return section.id
}

async function seedOne(
  prisma: PrismaClient,
  work: SeedWork,
  accounts: SeedAccounts,
): Promise<RequestsAdded> {
  const genres = await prisma.genre.findMany({
    where: { slug: { in: work.genres } },
    select: { id: true },
  })

  const now = new Date()

  return prisma.$transaction(async (tx) => {
    const storyboard = await tx.storyboard.create({
      data: {
        publicId: work.publicId,
        slug: `${slugify(work.title)}-${work.publicId}`,
        title: work.title,
        logline: work.logline,
        type: work.type,
        visibility: 'PUBLIC',
        // Decision 0007 — public from the start, so the whole history reads.
        publicFrom: now,
        isSeed: true,
        ownerId: accounts.platformId,
        rightsNote: `${work.source.author}, first published ${String(
          work.source.firstPublished,
        )}. Public domain in the United States. Text from ${work.source.url}`,
        genres: { create: genres.map((genre) => ({ genreId: genre.id })) },
      },
      select: { id: true },
    })

    const version = await tx.version.create({
      data: {
        storyboardId: storyboard.id,
        name: 'Main draft',
        isMain: true,
        createdById: accounts.platformId,
      },
      select: { id: true },
    })

    const chapter = await tx.chapter.create({
      data: {
        versionId: version.id,
        lineageId: randomUUID(),
        order: 0,
        title: work.chapter.title,
      },
      select: { id: true },
    })

    const sections: string[] = []
    for (const [index, text] of work.chapter.sections.entries()) {
      sections.push(await createSection(tx, chapter.id, index, text, accounts.platformId))
    }

    return ensureRequests(tx, {
      storyboardId: storyboard.id,
      accounts,
      requests: work.requests,
      sections: [sections],
    })
  })
}
