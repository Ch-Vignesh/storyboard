import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'
import { notFound } from 'next/navigation'

import { caller } from '@/trpc/server'

import { readTimeZone } from '@/lib/dates'

import { ContentsEditor } from './contents-editor'
import { RemovedList } from './removed-list'

type Params = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ version?: string }>
}

export const metadata: Metadata = { title: 'Contents' }

/** FR-2.3, FR-2.4 — the shape of the manuscript, where it can be rearranged. */
export default async function ContentsPage({ params, searchParams }: Params) {
  const { slug } = await params
  // FR-10.1 (phase 14, item 1.2) — the contents of the version being read.
  // The page took no version, so rearranging "an alternate" rearranged the
  // main draft that readers see.
  const { version: versionId } = (await searchParams) ?? {}

  let data
  try {
    data = await caller.storyboard.get({ slug, versionId })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  if (!data.permissions.canStructure) notFound()
  const { version } = data
  // Every link out of here stays in the version being rearranged.
  const versionQuery = version.isMain ? '' : `?version=${encodeURIComponent(version.id)}`

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}${versionQuery}`} className="hover:text-ink hover:underline">
          {data.storyboard.title}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
        {version.isMain ? 'Contents' : `Contents of “${version.name}”`}
      </h1>
      {version.isMain ? null : (
        <p className="mt-2 text-[13px] text-ink-soft">
          An alternate version. Nothing here changes the main draft.
        </p>
      )}
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        Drag to rearrange. A section is the unit other writers can help with, so keep them to a
        scene or a beat rather than a whole chapter.
      </p>

      <ContentsEditor
        slug={slug}
        versionId={version.id}
        versionQuery={versionQuery}
        chapters={data.chapters}
      />
      {/* Item 5.7 — the way back for what was removed lately. */}
      <RemovedList slug={slug} versionId={version.id} timeZone={await readTimeZone()} />
    </main>
  )
}
