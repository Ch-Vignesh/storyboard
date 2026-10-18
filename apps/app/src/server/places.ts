import 'server-only'

import type { PrismaClient } from '@storyboard/db'

/**
 * Where a section's lineage reads in a story's main draft, as an address.
 * Shared by credit lines (FR-9.6), the proof of authorship (FR-13.6) and, since
 * phase 14's item 6.10, every credit on a contributors page or a profile, which
 * all print or link one.
 */

export type Place = {
  /** The chapter's title, for a credit line. */
  chapter: string
  /** Its position in reading order, counted from 1, as the reader's address counts. */
  chapterNumber: number
  /** The section's position in that chapter, counted from 1. */
  sectionNumber: number
  path: string
}

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
  lineages: readonly string[],
): Promise<Map<string, Place>> {
  return placesInMainDrafts(db, [storyboardId], lineages)
}

/**
 * The same across several stories at once, in three queries however many
 * there are: a profile's page of credits spans many stories (item 6.10), and
 * asking each in turn would be three queries a story. Lineages are unique
 * across stories, so one map answers for all of them.
 */
export async function placesInMainDrafts(
  db: PrismaClient,
  storyboardIds: readonly string[],
  lineages: readonly string[],
): Promise<Map<string, Place>> {
  const places = new Map<string, Place>()
  if (storyboardIds.length === 0 || lineages.length === 0) return places

  const inMainDraft = {
    version: { storyboardId: { in: [...storyboardIds] }, isMain: true },
    deletedAt: null,
  }
  const [storyboards, chapters, joined] = await Promise.all([
    db.storyboard.findMany({
      where: { id: { in: [...storyboardIds] } },
      select: { id: true, slug: true },
    }),
    db.chapter.findMany({
      where: inMainDraft,
      orderBy: { order: 'asc' },
      select: {
        title: true,
        version: { select: { storyboardId: true } },
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

  const slugOf = new Map(storyboards.map((storyboard) => [storyboard.id, storyboard.slug]))
  // Chapters are counted within their own story, in reading order; the one
  // sort above keeps each story's chapters in order among the others'.
  const counted = new Map<string, number>()
  const byId = new Map<string, Place>()
  for (const chapter of chapters) {
    const storyboardId = chapter.version.storyboardId
    const slug = slugOf.get(storyboardId)
    if (!slug) continue
    const chapterNumber = (counted.get(storyboardId) ?? 0) + 1
    counted.set(storyboardId, chapterNumber)
    for (const [sectionIndex, section] of chapter.sections.entries()) {
      const place: Place = {
        chapter: chapter.title,
        chapterNumber,
        sectionNumber: sectionIndex + 1,
        path: `/s/${slug}/c/${String(chapterNumber)}/${String(sectionIndex + 1)}`,
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
