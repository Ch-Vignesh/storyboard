import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { orNotFound, storyMetadata } from '@/lib/metadata'
import { caller } from '@/trpc/server'

import { Reader } from '../../../reader'

import { locate } from './locate'

type Params = {
  params: Promise<{ slug: string; chapter: string; section: string }>
  searchParams?: Promise<{ version?: string }>
}

export const dynamic = 'force-dynamic'

// Item 9.6 — through the same `storyboard.get`, as the same person, as the page.
export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug, chapter, section } = await params
  const { version } = (await searchParams) ?? {}
  return orNotFound(storyMetadata(caller, { slug, versionId: version, chapter, section }))
}

/**
 * A section's permanent address (SRS section 4), which credit lines print
 * (FR-9.6): the reader, open at its chapter and scrolled to it. A position,
 * not an id, so it moves when the writer reorders, as a page number does.
 */
export default async function SectionAddressPage({ params, searchParams }: Params) {
  const { slug, chapter, section } = await params
  const { version } = (await searchParams) ?? {}
  const located = await locate(slug, chapter, section, version)
  // Decision 0044 (item 7b.2) — an edition is read at its own address.
  if (located.version.edition !== null) {
    redirect(`/s/${slug}/published/${String(located.version.edition)}?chapter=${chapter}`)
  }

  return (
    <Reader
      data={located.data}
      startAt={{ chapterId: located.chapter.id, sectionId: located.section.id }}
    />
  )
}
