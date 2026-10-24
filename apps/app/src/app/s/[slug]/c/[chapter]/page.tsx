import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { orNotFound, storyMetadata } from '@/lib/metadata'
import { caller } from '@/trpc/server'

import { Reader } from '../../reader'

import { locateChapter } from './[section]/locate'

type Params = {
  params: Promise<{ slug: string; chapter: string }>
  searchParams?: Promise<{ version?: string }>
}

export const dynamic = 'force-dynamic'

// Item 9.6 — through the same `storyboard.get`, as the same person, as the page.
export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug, chapter } = await params
  const { version } = (await searchParams) ?? {}
  return orNotFound(storyMetadata(caller, { slug, versionId: version, chapter }))
}

/** A chapter's address (SRS section 4): the reader, open at that chapter. */
export default async function ChapterAddressPage({ params, searchParams }: Params) {
  const { slug, chapter } = await params
  const { version } = (await searchParams) ?? {}
  const located = await locateChapter(slug, chapter, version)
  // Decision 0044 (item 7b.2) — an edition is read at its own address.
  if (located.version.edition !== null) {
    redirect(`/s/${slug}/published/${String(located.version.edition)}?chapter=${chapter}`)
  }

  return <Reader data={located.data} startAt={{ chapterId: located.chapter.id }} />
}
