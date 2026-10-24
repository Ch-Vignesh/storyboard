import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { readTimeZone } from '@/lib/dates'
import { editionMetadata, orNotFound } from '@/lib/metadata'
import { nameOf } from '@/lib/people'
import { formatInZone } from '@/lib/time-zone'
import { caller } from '@/trpc/server'

import { Reader } from '../reader'

/**
 * Decision 0044 (phase 14, item 7b.2) — a published edition, read as a
 * finished story is (FR-14.1): no margin, no request cards, the contributors
 * linked from the foot, and at the top which edition it is, when and by whom.
 * One chapter at a time, as the reader is (NFR-1); `?chapter=` picks it.
 *
 * Read with the story's own read right, so a private story's editions answer
 * 404 as the story does, and a number never published answers 404 too.
 */
async function load(slug: string, number?: number) {
  try {
    const edition = await caller.publication.get({ slug, number })
    const data = await caller.storyboard.get({ slug, versionId: edition.versionId })
    return { edition, data }
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
}

/** Item 9.6's rules, for an edition (`lib/metadata.ts`), as the same person the page reads as. */
export async function metadataFor(slug: string, number?: number): Promise<Metadata> {
  return orNotFound(editionMetadata(caller, { slug, number }))
}

export async function EditionPage({
  slug,
  number,
  chapter,
}: {
  slug: string
  /** Absent for the current edition, at `/s/{slug}/published`. */
  number?: number
  chapter?: string
}) {
  const [{ edition, data }, timeZone] = await Promise.all([load(slug, number), readTimeZone()])
  const requested = chapter === undefined ? null : Number.parseInt(chapter, 10)
  // A chapter past the end, or not a number, opens the first.
  const opening =
    requested !== null && Number.isInteger(requested) ? data.chapters[requested - 1] : undefined

  return (
    <Reader
      data={data}
      startAt={opening ? { chapterId: opening.id } : undefined}
      edition={{
        line: `Edition ${String(edition.number)}, published ${formatInZone(edition.publishedAt, 'long', timeZone)}, by ${nameOf(edition.publishedBy)}`,
        note: edition.note,
        base:
          number === undefined ? `/s/${slug}/published` : `/s/${slug}/published/${String(number)}`,
        current: edition.current,
      }}
    />
  )
}
