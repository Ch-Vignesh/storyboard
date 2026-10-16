import type { Metadata } from 'next'

import { Reader, readerMetadata } from '../../../reader'

import { locate } from './locate'

type Params = {
  params: Promise<{ slug: string; chapter: string; section: string }>
  searchParams?: Promise<{ version?: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug, chapter, section } = await params
  const { version } = (await searchParams) ?? {}
  const located = await locate(slug, chapter, section, version)
  return readerMetadata(located.storyboard)
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

  return (
    <Reader
      data={located.data}
      startAt={{ chapterId: located.chapter.id, sectionId: located.section.id }}
    />
  )
}
