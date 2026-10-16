import 'server-only'

import { TRPCError } from '@trpc/server'
import { notFound } from 'next/navigation'

import { caller } from '@/trpc/server'

/**
 * Resolves the SRS section 4 URL shape — `/s/{slug}/c/{chapter-no}/{section}` —
 * to the ids the API works in.
 *
 * Chapter and section are 1-based positions in reading order, matching the
 * "chapter-no" the SRS asks for. They move when a writer reorders, which is the
 * same thing that happens to a chapter number in a printed book; ids would be
 * stable but would make the URL unreadable, and the SRS chose readable.
 *
 * A position only means something inside one version (FR-10.1): chapter 4 of
 * the main draft and chapter 4 of an alternate are different sections. Without
 * `versionId` every route here silently resolves to the main draft, so reading
 * an alternate and clicking Edit would edit the draft you were not looking at.
 */
export async function locate(
  slug: string,
  chapterNo: string,
  sectionNo: string,
  versionId?: string,
) {
  const sectionIndex = positionIn(sectionNo)
  const located = await locateChapter(slug, chapterNo, versionId)

  const section = located.chapter.sections[sectionIndex]
  if (!section) notFound()

  return { ...located, section, sectionNumber: sectionIndex + 1 }
}

/** `/s/{slug}/c/{chapter-no}` alone: the same rules, one level up. */
export async function locateChapter(slug: string, chapterNo: string, versionId?: string) {
  const chapterIndex = positionIn(chapterNo)

  let data
  try {
    data = await caller.storyboard.get({ slug, versionId })
  } catch (error) {
    // Private storyboards are 404 at every route, this one included.
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const chapter = data.chapters[chapterIndex]
  if (!chapter) notFound()

  return {
    data,
    storyboard: data.storyboard,
    permissions: data.permissions,
    version: data.version,
    chapter,
    chapterNumber: chapterIndex + 1,
  }
}

/** A 1-based position from the URL, as a 0-based index; anything else is a 404. */
function positionIn(segment: string): number {
  // Digits only: `Number` would also take "1e1", " 2" and "0x3".
  if (!/^[1-9]\d{0,5}$/.test(segment)) notFound()
  return Number(segment) - 1
}
