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
  const chapterIndex = Number(chapterNo) - 1
  const sectionIndex = Number(sectionNo) - 1
  if (!Number.isInteger(chapterIndex) || !Number.isInteger(sectionIndex)) notFound()
  if (chapterIndex < 0 || sectionIndex < 0) notFound()

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
  const section = chapter.sections[sectionIndex]
  if (!section) notFound()

  return {
    storyboard: data.storyboard,
    permissions: data.permissions,
    version: data.version,
    chapter,
    chapterNumber: chapterIndex + 1,
    section,
    sectionNumber: sectionIndex + 1,
  }
}
