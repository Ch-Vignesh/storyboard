import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EditionPage, metadataFor } from '../edition'

type Params = {
  params: Promise<{ slug: string; number: string }>
  searchParams?: Promise<{ chapter?: string }>
}

export const dynamic = 'force-dynamic'

/** "3" and nothing else: not "03", not "3a". */
function editionNumber(value: string): number | null {
  return /^[1-9]\d{0,5}$/u.test(value) ? Number(value) : null
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, number } = await params
  const parsed = editionNumber(number)
  if (parsed === null) notFound()
  return metadataFor(slug, parsed)
}

/** Decision 0044 (item 7b.2) — any edition, by its number; earlier ones stay readable. */
export default async function NumberedEditionPage({ params, searchParams }: Params) {
  const { slug, number } = await params
  const { chapter } = (await searchParams) ?? {}
  const parsed = editionNumber(number)
  if (parsed === null) notFound()
  return <EditionPage slug={slug} number={parsed} chapter={chapter} />
}
