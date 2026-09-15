import { createHash, randomUUID } from 'node:crypto'

import type { PrismaClient } from '../../../src/generated/prisma/client'
import { LIBRARY, SEED_HELPERS, type SeedRequest, type SeedWork } from './library'
import { PLATFORM_ACCOUNT } from './index'

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
 */

const WORDS = /\s+/u

function derive(text: string) {
  const trimmed = text.trim()
  return {
    contentText: trimmed,
    wordCount: trimmed.length === 0 ? 0 : trimmed.split(WORDS).length,
    contentHash: createHash('sha256').update(trimmed, 'utf8').digest('hex'),
  }
}

/** Paragraphs to the restricted document FR-4.1 allows, and nothing else. */
function doc(paragraphs: string[]) {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  }
}

function slugify(title: string): string {
  return (
    title
      .normalize('NFKD')
      .toLowerCase()
      .replaceAll(/[^\w\s-]+/gu, '')
      .trim()
      .replaceAll(/\s+/gu, '-')
      .slice(0, 60) || 'storyboard'
  )
}

export type LibraryResult = {
  created: number
  skipped: number
  requests: number
  answered: number
  /** Sections whose text was corrected on a database that already had them. */
  corrected: number
}

export async function seedLibrary(prisma: PrismaClient): Promise<LibraryResult> {
  const platform = await prisma.user.upsert({
    where: { email: PLATFORM_ACCOUNT.email },
    create: {
      email: PLATFORM_ACCOUNT.email,
      username: PLATFORM_ACCOUNT.username,
      displayName: PLATFORM_ACCOUNT.displayName,
      bio: PLATFORM_ACCOUNT.bio,
      onboardedAt: new Date(),
    },
    update: {},
    select: { id: true },
  })

  // FR-15.3 — the contributors of the seeded suggestions are seeded accounts
  // too, and say so on their profiles. A credit line pointing at an invented
  // person would be the fake community the requirement forbids.
  const helpers = new Map<string, string>()
  for (const helper of SEED_HELPERS) {
    const row = await prisma.user.upsert({
      where: { email: `${helper.username}@storyboard.invalid` },
      create: {
        email: `${helper.username}@storyboard.invalid`,
        username: helper.username,
        displayName: helper.displayName,
        bio: helper.bio,
        onboardedAt: new Date(),
      },
      update: { displayName: helper.displayName, bio: helper.bio },
      select: { id: true },
    })
    helpers.set(helper.username, row.id)
  }

  const result: LibraryResult = { created: 0, skipped: 0, requests: 0, answered: 0, corrected: 0 }

  for (const work of LIBRARY) {
    const existing = await prisma.storyboard.findUnique({
      where: { publicId: work.publicId },
      select: { id: true },
    })
    if (existing) {
      result.skipped += 1
      result.corrected += await reconcileText(prisma, work, existing.id, platform.id)
      continue
    }

    const counts = await seedOne(prisma, work, platform.id, helpers)
    result.created += 1
    result.requests += counts.requests
    result.answered += counts.answered
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
    if (current.contentText === wanted.trim()) continue

    // Somebody else's prose stands here now. Leave it alone.
    if (current.source !== 'AUTHORED' || current.authorId !== platformId) continue

    const derived = derive(wanted)
    await prisma.$transaction(async (tx) => {
      const revision = await tx.revision.create({
        data: {
          sectionId: section.id,
          parentId: current.id,
          contentJson: doc([wanted]),
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

async function seedOne(
  prisma: PrismaClient,
  work: SeedWork,
  platformId: string,
  helpers: Map<string, string>,
): Promise<{ requests: number; answered: number }> {
  const genres = await prisma.genre.findMany({
    where: { slug: { in: work.genres } },
    select: { id: true },
  })

  const now = new Date()
  let requests = 0
  let answered = 0

  await prisma.$transaction(async (tx) => {
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
        ownerId: platformId,
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
        createdById: platformId,
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

    /** Section id and head revision id, by index, for the requests below. */
    const sections: Array<{ id: string; revisionId: string }> = []

    for (const [index, text] of work.chapter.sections.entries()) {
      const content = doc([text])
      const derived = derive(text)

      const section = await tx.section.create({
        data: {
          chapterId: chapter.id,
          lineageId: randomUUID(),
          order: index,
          wordCount: derived.wordCount,
        },
        select: { id: true },
      })

      const revision = await tx.revision.create({
        data: {
          sectionId: section.id,
          contentJson: content,
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

      sections.push({ id: section.id, revisionId: revision.id })
    }

    // FR-5.1, enforced by `one_open_request_per_section`: a section may have
    // only one request in OPEN or ANSWERED at a time. A resolved one does not
    // count, so an answered request can share a section with an open one — but
    // two open ones cannot. The library asks for a section by index; this puts
    // each open request on the first section that is still free, so the data
    // can say where a stuck point *is* without also having to solve the
    // packing problem.
    const spokenFor = new Set<number>()

    for (const request of work.requests) {
      let index = request.section
      if (!request.accepted) {
        if (spokenFor.has(index)) {
          const free = sections.findIndex((_, at) => !spokenFor.has(at))
          if (free === -1) {
            // Nowhere to put it. Better to seed one request fewer than to seed
            // a storyboard that will not load.
            continue
          }
          index = free
        }
        spokenFor.add(index)
      }

      const target = sections[index] ?? sections[0]
      if (!target) continue

      const created = await createRequest(tx, {
        request,
        storyboardId: storyboard.id,
        sectionId: target.id,
        headRevisionId: target.revisionId,
        platformId,
        helpers,
      })

      requests += 1
      if (created.answered) answered += 1
    }
  })

  return { requests, answered }
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

async function createRequest(
  tx: Tx,
  input: {
    request: SeedRequest
    storyboardId: string
    sectionId: string
    headRevisionId: string
    platformId: string
    helpers: Map<string, string>
  },
): Promise<{ answered: boolean }> {
  const { request } = input

  const row = await tx.contributionRequest.create({
    data: {
      publicId: randomUUID().replaceAll('-', '').slice(0, 10),
      storyboardId: input.storyboardId,
      sectionId: input.sectionId,
      openedById: input.platformId,
      kind: request.kind,
      title: request.title,
      ask: request.ask,
      preContext: request.preContext ?? null,
      state: request.accepted ? 'RESOLVED' : 'OPEN',
    },
    select: { id: true },
  })

  if (!request.accepted) return { answered: false }

  const contributorId = input.helpers.get(request.accepted.by)
  if (!contributorId) return { answered: false }

  // FR-15.4 wants answered requests visible so a visitor can see the loop
  // close: the suggestion, the acceptance, and the credit that followed.
  const derived = derive(request.accepted.prose)
  const suggestion = await tx.suggestion.create({
    data: {
      publicId: randomUUID().replaceAll('-', '').slice(0, 10),
      requestId: row.id,
      contributorId,
      baseRevisionId: input.headRevisionId,
      contentJson: doc([request.accepted.prose]),
      // A suggestion carries no hash: it is not yet a revision, and nothing
      // depends on proving when it was written until it is accepted.
      contentText: derived.contentText,
      wordCount: derived.wordCount,
      note: request.accepted.note,
      state: 'ACCEPTED',
      submittedAt: new Date(),
      decidedAt: new Date(),
      decidedById: input.platformId,
    },
    select: { id: true },
  })

  // FR-8.1 — accepting writes a revision attributed to both halves.
  const revision = await tx.revision.create({
    data: {
      sectionId: input.sectionId,
      parentId: input.headRevisionId,
      contentJson: doc([request.accepted.prose]),
      ...derived,
      source: 'ACCEPTED',
      authorId: contributorId,
      acceptedById: input.platformId,
      suggestionId: suggestion.id,
    },
    select: { id: true },
  })

  await tx.section.update({
    where: { id: input.sectionId },
    data: { currentRevisionId: revision.id, wordCount: derived.wordCount },
  })

  // FR-9.1 — the credit, which is the point of the whole loop.
  const section = await tx.section.findUniqueOrThrow({
    where: { id: input.sectionId },
    select: { lineageId: true },
  })
  await tx.credit.create({
    data: {
      storyboardId: input.storyboardId,
      contributorId,
      type: 'PROSE',
      sectionLineage: section.lineageId,
      revisionId: revision.id,
      suggestionId: suggestion.id,
      isLive: true,
    },
  })

  return { answered: true }
}
