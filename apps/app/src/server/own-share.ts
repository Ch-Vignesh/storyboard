import 'server-only'

import type { PrismaClient } from '@storyboard/db'

import { ownShareOf } from '@/lib/own-share'
import { AUTHORS_SELECT, authorsOf } from '@/server/answers'

/**
 * Item 6.17 (FR-9.2, decision 0041) — what share of each story's main draft
 * is its author's own words, over the live sections and who wrote the
 * revision each stands on (`lib/own-share.ts` has the rule). Several stories
 * at once in two queries, for a profile's list; one story is the same call.
 */
export async function mainDraftOwnShares(
  db: PrismaClient,
  storyboardIds: readonly string[],
): Promise<Map<string, number | null>> {
  const shares = new Map<string, number | null>()
  if (storyboardIds.length === 0) return shares

  const [stories, sections] = await Promise.all([
    db.storyboard.findMany({
      where: { id: { in: [...storyboardIds] } },
      select: { id: true, ...AUTHORS_SELECT },
    }),
    db.section.findMany({
      where: {
        deletedAt: null,
        mergedIntoId: null,
        chapter: {
          deletedAt: null,
          version: { isMain: true, storyboardId: { in: [...storyboardIds] } },
        },
      },
      select: {
        wordCount: true,
        currentRevision: { select: { authorId: true } },
        chapter: { select: { version: { select: { storyboardId: true } } } },
      },
    }),
  ])

  const byStory = new Map<string, Array<{ wordCount: number; authorId: string | null }>>()
  for (const section of sections) {
    const id = section.chapter.version.storyboardId
    const list = byStory.get(id) ?? []
    list.push({ wordCount: section.wordCount, authorId: section.currentRevision?.authorId ?? null })
    byStory.set(id, list)
  }
  for (const story of stories) {
    const { ownerId, coauthorIds } = authorsOf(story)
    shares.set(
      story.id,
      ownShareOf(byStory.get(story.id) ?? [], new Set([ownerId, ...coauthorIds])),
    )
  }
  return shares
}

export async function mainDraftOwnShare(
  db: PrismaClient,
  storyboardId: string,
): Promise<number | null> {
  return (await mainDraftOwnShares(db, [storyboardId])).get(storyboardId) ?? null
}
