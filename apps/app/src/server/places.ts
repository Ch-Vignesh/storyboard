import 'server-only'

import type { PrismaClient } from '@storyboard/db'

/**
 * Where a section's lineage reads in a story's main draft, as an address.
 * Shared by credit lines (FR-9.6) and the proof of authorship (FR-13.6), which
 * both print one.
 */

export type Place = { chapter: string; path: string }

/**
 * Where each lineage reads in the main draft, at the address the reader
 * resolves: chapter and section counted by position in reading order, as
 * `locate` counts them. Built from the stored `order` fields until the
 * 2026-10-16 spec review, which matched only while they stayed 0..n-1.
 *
 * A section joined into the one above it (FR-2.4) is no longer in the reading
 * order, but its words are, in the section that took them: its credit points
 * there, following a chain of joins, rather than at whatever now stands where
 * it used to be.
 */
export async function mainDraftPlaces(
  db: PrismaClient,
  storyboardId: string,
  lineages: string[],
): Promise<Map<string, Place>> {
  const inMainDraft = { version: { storyboardId, isMain: true }, deletedAt: null }
  const [storyboard, chapters, joined] = await Promise.all([
    db.storyboard.findUniqueOrThrow({ where: { id: storyboardId }, select: { slug: true } }),
    db.chapter.findMany({
      where: inMainDraft,
      orderBy: { order: 'asc' },
      select: {
        title: true,
        sections: {
          where: { deletedAt: null, mergedIntoId: null },
          orderBy: { order: 'asc' },
          select: { id: true, lineageId: true },
        },
      },
    }),
    db.section.findMany({
      where: { chapter: inMainDraft, deletedAt: null, mergedIntoId: { not: null } },
      select: { id: true, lineageId: true, mergedIntoId: true },
    }),
  ])

  const byId = new Map<string, Place>()
  const places = new Map<string, Place>()
  for (const [chapterIndex, chapter] of chapters.entries()) {
    for (const [sectionIndex, section] of chapter.sections.entries()) {
      const place = {
        chapter: chapter.title,
        path: `/s/${storyboard.slug}/c/${String(chapterIndex + 1)}/${String(sectionIndex + 1)}`,
      }
      byId.set(section.id, place)
      places.set(section.lineageId, place)
    }
  }

  const intoOf = new Map(joined.map((section) => [section.id, section.mergedIntoId]))
  const wanted = new Set(lineages)
  for (const section of joined) {
    if (!wanted.has(section.lineageId) || places.has(section.lineageId)) continue
    let into = section.mergedIntoId
    // A join can only point up the reading order, so the chain ends; the
    // bound is for data nobody meant to write.
    for (let step = 0; into && !byId.has(into) && step < joined.length; step += 1) {
      into = intoOf.get(into) ?? null
    }
    const place = into ? byId.get(into) : undefined
    if (place) places.set(section.lineageId, place)
  }
  return places
}
