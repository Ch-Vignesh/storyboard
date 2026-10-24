/**
 * FR-15.2, FR-15.3 — the seeded example storyboard.
 *
 * Idempotent like the rest of the seed (FR-15.6): it is keyed on the platform
 * account's email and the storyboard's `publicId`, so a second run finds both
 * and creates nothing.
 *
 * Since phase 14's item 9.5 a run on a database that already has the story
 * still adds what the story gained after that database was seeded — the empty
 * last chapter, the stuck points and the help on them — and nothing else. The
 * text Gilman wrote is never touched once it is there.
 *
 * The document shape and the derived columns are duplicated here rather than
 * imported from `apps/app`: `packages/db` must not depend on the application,
 * and a seed that drifts from FR-4.1 would be caught the moment the reader
 * renders it. The two are small (`prose.ts`), and `derive()` in the app is the
 * one that matters at runtime.
 */

import { randomUUID } from 'node:crypto'

import type { PrismaClient } from '../../../src/generated/prisma/client'

import { PLATFORM_ACCOUNT, type SeedAccounts } from './accounts'
import { EXAMPLE_REQUESTS, EXAMPLE_STORYBOARD } from './example-storyboard'
import { deriveOf, docOf } from './prose'
import { ensureRequests, type RequestsAdded, type Tx } from './requests'

/** The account every seeded storyboard belongs to (FR-15.3). */
export { PLATFORM_ACCOUNT }

/** Stable, so a second run recognises the storyboard it made last time. */
const EXAMPLE_PUBLIC_ID = 'seedyellow1'

export async function seedExampleStoryboard(
  prisma: PrismaClient,
  accounts: SeedAccounts,
): Promise<string> {
  const existing = await prisma.storyboard.findUnique({
    where: { publicId: EXAMPLE_PUBLIC_ID },
    select: { id: true, deletedAt: true },
  })

  if (existing) {
    // On its way out: deleted, and waiting for the purge. Nothing is added to it.
    if (existing.deletedAt) return 'already present, deleted, left alone'

    const added = await prisma.$transaction(async (tx) => {
      const sections = await ensureChapters(tx, existing.id, accounts.platformId)
      return ensureRequests(tx, {
        storyboardId: existing.id,
        accounts,
        requests: EXAMPLE_REQUESTS,
        sections,
      })
    })
    return `already present${describe(added)}`
  }

  const genres = await prisma.genre.findMany({
    where: { slug: { in: [...EXAMPLE_STORYBOARD.genres] } },
    select: { id: true },
  })

  const now = new Date()

  const added = await prisma.$transaction(async (tx) => {
    const storyboard = await tx.storyboard.create({
      data: {
        publicId: EXAMPLE_PUBLIC_ID,
        slug: `the-yellow-wallpaper-${EXAMPLE_PUBLIC_ID}`,
        title: EXAMPLE_STORYBOARD.title,
        logline: EXAMPLE_STORYBOARD.logline,
        type: EXAMPLE_STORYBOARD.type,
        visibility: 'PUBLIC',
        // Decision 0007: a storyboard that has always been public is stamped at
        // creation, so its whole history is readable.
        publicFrom: now,
        isSeed: true,
        ownerId: accounts.platformId,
        rightsNote: `${EXAMPLE_STORYBOARD.source.note} First published ${String(
          EXAMPLE_STORYBOARD.source.firstPublished,
        )}. Text from ${EXAMPLE_STORYBOARD.source.url}`,
        genres: { create: genres.map((genre) => ({ genreId: genre.id })) },
      },
      select: { id: true },
    })

    await tx.version.create({
      data: {
        storyboardId: storyboard.id,
        name: 'Main draft',
        isMain: true,
        createdById: accounts.platformId,
      },
      select: { id: true },
    })

    const sections = await ensureChapters(tx, storyboard.id, accounts.platformId)
    return ensureRequests(tx, {
      storyboardId: storyboard.id,
      accounts,
      requests: EXAMPLE_REQUESTS,
      sections,
    })
  })

  return `created${describe(added)}`
}

function describe(added: RequestsAdded): string {
  const parts = [
    added.requests ? `${String(added.requests)} request(s) added` : '',
    added.help ? `${String(added.help)} suggestion(s) and idea(s) added` : '',
    added.unplaced.length ? `not placed: ${added.unplaced.join('; ')}` : '',
  ].filter(Boolean)
  return parts.length ? `, ${parts.join(', ')}` : ''
}

/**
 * The main draft's chapters and sections, made where missing, as the
 * requests address them: section ids by chapter and position. On a database
 * seeded before item 9.5 this adds the empty last chapter and nothing more.
 */
async function ensureChapters(
  tx: Tx,
  storyboardId: string,
  platformId: string,
): Promise<string[][]> {
  const version = await tx.version.findFirstOrThrow({
    where: { storyboardId, isMain: true },
    select: { id: true },
  })
  const present = await tx.chapter.findMany({
    where: { versionId: version.id, deletedAt: null },
    select: {
      id: true,
      order: true,
      sections: { where: { deletedAt: null }, select: { id: true, order: true } },
    },
  })

  const grid: string[][] = []
  for (const [chapterIndex, chapter] of EXAMPLE_STORYBOARD.chapters.entries()) {
    const found = present.find((candidate) => candidate.order === chapterIndex)
    const chapterId =
      found?.id ??
      (
        await tx.chapter.create({
          data: {
            versionId: version.id,
            lineageId: randomUUID(),
            order: chapterIndex,
            title: chapter.title,
          },
          select: { id: true },
        })
      ).id

    const ids: string[] = []
    for (const [sectionIndex, paragraphs] of chapter.sections.entries()) {
      const section = found?.sections.find((candidate) => candidate.order === sectionIndex)
      ids.push(
        section?.id ?? (await createSection(tx, chapterId, sectionIndex, paragraphs, platformId)),
      )
    }
    grid.push(ids)
  }
  return grid
}

async function createSection(
  tx: Tx,
  chapterId: string,
  order: number,
  paragraphs: readonly string[],
  platformId: string,
): Promise<string> {
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
      // Gilman's text came in from an edition; the empty section is the
      // example author's own, waiting for somebody to write it.
      source: paragraphs.length > 0 ? 'IMPORTED' : 'AUTHORED',
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
