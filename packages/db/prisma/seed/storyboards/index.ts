/**
 * FR-15.2, FR-15.3 — the seeded example storyboard.
 *
 * Idempotent like the rest of the seed (FR-15.6): it is keyed on the platform
 * account's email and the storyboard's `publicId`, so a second run finds both
 * and creates nothing.
 *
 * The document shape and the derived columns are duplicated here rather than
 * imported from `apps/app`: `packages/db` must not depend on the application,
 * and a seed that drifts from FR-4.1 would be caught the moment the reader
 * renders it. The two are small, and `derive()` in the app is the one that
 * matters at runtime.
 */

import { createHash, randomUUID } from 'node:crypto'

import type { PrismaClient } from '../../../src/generated/prisma/client'

import { EXAMPLE_STORYBOARD } from './example-storyboard'

/** The account every seeded storyboard belongs to (FR-15.3). */
export const PLATFORM_ACCOUNT = {
  email: 'examples@storyboard.invalid',
  username: 'storyboard-examples',
  displayName: 'Storyboard examples',
  bio: 'Public-domain manuscripts, posted as examples of how a storyboard reads.',
} as const

/** Stable, so a second run recognises the storyboard it made last time. */
const EXAMPLE_PUBLIC_ID = 'seedyellow1'

type Doc = {
  type: 'doc'
  content: Array<{ type: 'paragraph'; content?: Array<{ type: 'text'; text: string }> }>
}

function toDoc(paragraphs: readonly string[]): Doc {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  }
}

/** FR-4.3 and FR-13.6, matching `apps/app/src/lib/doc/text.ts`. */
function derive(paragraphs: readonly string[]) {
  const contentText = paragraphs.join('\n\n')
  let wordCount = 0
  for (const token of contentText.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) wordCount += 1
  }
  return {
    contentText,
    wordCount,
    contentHash: createHash('sha256').update(contentText, 'utf8').digest('hex'),
  }
}

export async function seedExampleStoryboard(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.storyboard.findUnique({
    where: { publicId: EXAMPLE_PUBLIC_ID },
    select: { id: true },
  })
  if (existing) return 'already present'

  // The platform account has no password hash and no verified email, so it can
  // never be signed into. It exists to own examples, nothing else.
  const platform = await prisma.user.upsert({
    where: { email: PLATFORM_ACCOUNT.email },
    create: {
      email: PLATFORM_ACCOUNT.email,
      username: PLATFORM_ACCOUNT.username,
      displayName: PLATFORM_ACCOUNT.displayName,
      bio: PLATFORM_ACCOUNT.bio,
      onboardedAt: new Date(),
    },
    update: { displayName: PLATFORM_ACCOUNT.displayName, bio: PLATFORM_ACCOUNT.bio },
    select: { id: true },
  })

  const genres = await prisma.genre.findMany({
    where: { slug: { in: [...EXAMPLE_STORYBOARD.genres] } },
    select: { id: true },
  })

  const now = new Date()

  await prisma.$transaction(async (tx) => {
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
        ownerId: platform.id,
        rightsNote: `${EXAMPLE_STORYBOARD.source.note} First published ${String(
          EXAMPLE_STORYBOARD.source.firstPublished,
        )}. Text from ${EXAMPLE_STORYBOARD.source.url}`,
        genres: { create: genres.map((genre) => ({ genreId: genre.id })) },
      },
      select: { id: true },
    })

    const version = await tx.version.create({
      data: {
        storyboardId: storyboard.id,
        name: 'Main draft',
        isMain: true,
        createdById: platform.id,
      },
      select: { id: true },
    })

    for (const [chapterIndex, chapter] of EXAMPLE_STORYBOARD.chapters.entries()) {
      const created = await tx.chapter.create({
        data: {
          versionId: version.id,
          lineageId: randomUUID(),
          order: chapterIndex,
          title: chapter.title,
        },
        select: { id: true },
      })

      for (const [sectionIndex, paragraphs] of chapter.sections.entries()) {
        const derived = derive(paragraphs)
        const section = await tx.section.create({
          data: {
            chapterId: created.id,
            lineageId: randomUUID(),
            order: sectionIndex,
            wordCount: derived.wordCount,
          },
          select: { id: true },
        })
        const revision = await tx.revision.create({
          data: {
            sectionId: section.id,
            contentJson: toDoc(paragraphs),
            contentText: derived.contentText,
            wordCount: derived.wordCount,
            contentHash: derived.contentHash,
            source: 'IMPORTED',
            authorId: platform.id,
          },
          select: { id: true },
        })
        await tx.section.update({
          where: { id: section.id },
          data: { currentRevisionId: revision.id },
        })
      }
    }
  })

  return 'created'
}
