import type { Metadata } from 'next'
import Link from 'next/link'

import { caller } from '@/trpc/server'

import { locate } from '../locate'
import { HistoryPanel } from './history-panel'

type Params = { params: Promise<{ slug: string; chapter: string; section: string }> }

export const metadata: Metadata = { title: 'History' }

/**
 * Screen 11 — FR-8.3. Every revision, with who wrote it, when, and where it
 * came from. Restoring one (FR-8.4) appends; it never rewinds.
 */
export default async function SectionHistoryPage({ params }: Params) {
  const { slug, chapter: chapterNo, section: sectionNo } = await params
  const located = await locate(slug, chapterNo, sectionNo)
  const history = await caller.section.history({ sectionId: located.section.id })

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {located.storyboard.title}
        </Link>
        <span aria-hidden> / </span>
        <span>
          {located.chapterNumber}. {located.chapter.title}
        </span>
      </nav>

      <h1 className="font-manuscript text-[26px] leading-tight font-medium text-ink">
        History of {located.section.title ?? `section ${located.sectionNumber}`}
      </h1>
      <p className="mt-2 text-[13.5px] text-ink-soft">
        Every version ever saved. Nothing here is ever overwritten or removed.
      </p>

      <HistoryPanel
        sectionId={located.section.id}
        initial={history}
        canRestore={located.permissions.canRestore}
        backHref={`/s/${slug}`}
      />
    </main>
  )
}
