import { FORMAT_LABELS, formatsFor } from '@storyboard/export'
import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { flavourForStoryType } from '@/lib/doc/schema'
import { caller } from '@/trpc/server'

import { FinishedSwitch } from './finished-switch'

type Params = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Take it out' }

/** FR-14 — export, and the finished state that usually precedes it. */
export default async function ExportPage({ params }: Params) {
  const { slug } = await params

  let data
  try {
    data = await caller.storyboard.get({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  const { storyboard, permissions } = data

  // FR-14 is the author's, decided in `lib/authz` and not by this component.
  if (!permissions.canExport) notFound()

  const isScreenplay = flavourForStoryType(storyboard.type) === 'screenplay'
  const formats = formatsFor(isScreenplay)

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
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
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {formats.map((format) => (
            <li key={format} className="flex items-center justify-between gap-4 py-3">
              <span className="text-[14.5px] text-ink">{FORMAT_LABELS[format]}</span>
              <a
                href={`/api/export/${encodeURIComponent(slug)}?format=${format}`}
                className="shrink-0 text-[13.5px] text-pencil hover:underline"
              >
                Download
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
          {isScreenplay
            ? 'Fountain opens in any screenwriting software, and in any text editor.'
            : 'EPUB opens in a reading app; Word and PDF are what an agent or a printer will ask for.'}{' '}
          The contributors page and the source line are part of every file and cannot be turned off
          here.
        </p>
      </section>

      {/* FR-14.1 — finished, and what that changes. */}
      {permissions.canSetVisibility ? (
        <section className="mt-10 border-t border-rule pt-8">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
            Is it finished?
          </h2>
          <FinishedSwitch
            storyboardId={storyboard.id}
            slug={slug}
            finished={storyboard.state === 'FINISHED'}
            finishedAt={storyboard.finishedAt}
          />
        </section>
      ) : null}
    </main>
  )
}
