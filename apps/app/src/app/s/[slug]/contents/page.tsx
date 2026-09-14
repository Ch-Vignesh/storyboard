import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { caller } from '@/trpc/server'

import { ContentsEditor } from './contents-editor'

type Params = { params: Promise<{ slug: string }> }

export const metadata: Metadata = { title: 'Contents' }

/** FR-2.3, FR-2.4 — the shape of the manuscript, where it can be rearranged. */
export default async function ContentsPage({ params }: Params) {
  const { slug } = await params

  let data
  try {
    data = await caller.storyboard.get({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  if (!data.permissions.canStructure) notFound()

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {data.storyboard.title}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Contents</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        Drag to rearrange. A section is the unit other writers can help with, so keep them to a
        scene or a beat rather than a whole chapter.
      </p>

      <ContentsEditor slug={slug} versionId={data.version.id} chapters={data.chapters} />
    </main>
  )
}
