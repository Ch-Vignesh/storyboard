import type { Metadata } from 'next'

import { EditionPage, metadataFor } from './edition'

type Params = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ chapter?: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  return metadataFor(slug)
}

/** Decision 0044 (item 7b.2) — the current edition: the newest published. */
export default async function CurrentEditionPage({ params, searchParams }: Params) {
  const { slug } = await params
  const { chapter } = (await searchParams) ?? {}
  return <EditionPage slug={slug} chapter={chapter} />
}
