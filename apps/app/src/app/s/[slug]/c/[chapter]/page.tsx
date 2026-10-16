import type { Metadata } from 'next'

import { Reader, readerMetadata } from '../../reader'

import { locateChapter } from './[section]/locate'

type Params = {
  params: Promise<{ slug: string; chapter: string }>
  searchParams?: Promise<{ version?: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug, chapter } = await params
  const { version } = (await searchParams) ?? {}
  const located = await locateChapter(slug, chapter, version)
  return readerMetadata(located.storyboard)
}

/** A chapter's address (SRS section 4): the reader, open at that chapter. */
export default async function ChapterAddressPage({ params, searchParams }: Params) {
  const { slug, chapter } = await params
  const { version } = (await searchParams) ?? {}
  const located = await locateChapter(slug, chapter, version)

  return <Reader data={located.data} startAt={{ chapterId: located.chapter.id }} />
}
