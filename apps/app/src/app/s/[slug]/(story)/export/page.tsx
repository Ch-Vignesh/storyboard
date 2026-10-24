import { FORMAT_LABELS, formatsFor } from '@storyboard/export'
import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'
import { notFound } from 'next/navigation'

import { flavourForStoryType } from '@/lib/doc/schema'
import { NOT_INDEXED } from '@/lib/metadata'
import { caller } from '@/trpc/server'

import { ExportChoices } from './export-choices'

type Params = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ version?: string }>
}

export const dynamic = 'force-dynamic'
// Item 9.8 — an author's tools, not something to find in a search.
export const metadata: Metadata = { title: 'Take it out', robots: NOT_INDEXED }

/** FR-14 — export; the finished state that usually precedes it is in the story's settings. */
export default async function ExportPage({ params, searchParams }: Params) {
  const { slug } = await params
  // Item 8.8 — an alternate version's chapters, when one is chosen.
  const { version: asked } = (await searchParams) ?? {}
  // Item 7b.3 (decision 0044) — the published edition, when there is one, is
  // what a file is made of unless another version is chosen.
  const edition = await caller.publication.get({ slug }).catch(() => null)
  const versionId = asked ?? edition?.versionId

  let data
  try {
    data = await caller.storyboard.get({ slug, versionId })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  const { storyboard, permissions, version, chapters } = data

  // FR-14 is the author's, decided in `lib/authz` and not by this component.
  if (!permissions.canExport) notFound()

  const { versions } = await caller.version.list({ storyboardId: storyboard.id })
  const isScreenplay = flavourForStoryType(storyboard.type) === 'screenplay'
  const formats = formatsFor(isScreenplay)

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {storyboard.title}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
        Take it out
      </h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        Your manuscript as a file, with everyone who helped named in the front matter and the
        address it came from at the foot. Publishing it anywhere you like is expressly fine — this
        product makes no claim on your work.
      </p>

      <section className="mt-9">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">Download</h2>
        <ExportChoices
          // A fresh choice of chapter for each version.
          key={version.id}
          slug={slug}
          versions={[
            ...(edition
              ? [
                  {
                    id: edition.versionId,
                    name: `The published edition (edition ${String(edition.number)})`,
                    isMain: false,
                  },
                ]
              : []),
            ...versions.map(({ id, name, isMain }) => ({ id, name, isMain })),
          ]}
          versionId={version.id}
          chapters={chapters.map((chapter, index) => ({ number: index + 1, title: chapter.title }))}
          formats={formats.map((format) => ({ format, label: FORMAT_LABELS[format] }))}
        />
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
          {isScreenplay
            ? 'Fountain opens in any screenwriting software, and in any text editor.'
            : 'EPUB opens in a reading app; Word and PDF are what an agent or a printer will ask for.'}{' '}
          The contributors page and the source line are part of every file, a single chapter
          included, and cannot be turned off here. Each file is named for the story, the day and
          what it holds.
        </p>
      </section>

      {/* FR-14.1 — finishing lives in the story's settings since item 8.10;
          this page says where, since it is often the next thing asked. */}
      <p className="mt-10 border-t border-rule pt-6 text-[13.5px] leading-relaxed text-ink-soft">
        {storyboard.state === 'FINISHED' ? 'It is marked finished. ' : 'Is it finished? '}
        <Link href={`/s/${slug}/settings`} className="text-pencil hover:underline">
          Its settings
        </Link>{' '}
        are where a story is marked finished, and opened again.
      </p>
    </main>
  )
}
