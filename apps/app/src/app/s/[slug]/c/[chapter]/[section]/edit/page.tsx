import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SectionEditor } from '@/components/section-editor'
import { flavourForStoryType } from '@/lib/doc/schema'
import { caller } from '@/trpc/server'

import { locate } from '../locate'

type Params = {
  params: Promise<{ slug: string; chapter: string; section: string }>
  searchParams?: Promise<{ version?: string }>
}

export const metadata: Metadata = { title: 'Editing' }

/**
 * Screen 6 — the section editor. Distraction-free: no application chrome, the
 * manuscript measure, and the four-item toolbar FR-4.6 allows.
 */
export default async function EditSectionPage({ params, searchParams }: Params) {
  const { slug, chapter: chapterNo, section: sectionNo } = await params
  const { version } = (await searchParams) ?? {}
  const located = await locate(slug, chapterNo, sectionNo, version)

  // Carried on every link out of here, so a writer stays in the draft they
  // opened rather than being returned to the main one.
  const suffix = located.version.isMain ? '' : `?version=${encodeURIComponent(located.version.id)}`

  const detail = await caller.section.get({ sectionId: located.section.id })
  if (!detail.permissions.canEdit && !detail.permissions.canSubmitSuggestion) notFound()

  const returnHref = `/s/${slug}${suffix}`
  // FR-4.4 — a draft outranks the saved text: it is what this person was last
  // writing, and losing it on reload is the failure autosave exists to prevent.
  const initialContent = detail.draft?.contentJson ?? detail.section.currentRevision?.contentJson

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={returnHref} className="hover:text-ink hover:underline">
          {located.storyboard.title}
        </Link>
        <span aria-hidden> / </span>
        <span>
          {located.chapterNumber}. {located.chapter.title}
        </span>
        <span aria-hidden> / </span>
        <span>{located.section.title ?? `Section ${located.sectionNumber}`}</span>
        <span aria-hidden> · </span>
        <Link
          href={`/s/${slug}/c/${chapterNo}/${sectionNo}/history${suffix}`}
          className="hover:text-ink hover:underline"
        >
          History
        </Link>
      </nav>

      {detail.draft ? (
        <p className="mb-5 border-l-2 border-pencil bg-pencil-wash px-4 py-2.5 text-[13px] text-ink">
          Picking up the draft you left on{' '}
          {detail.draft.updatedAt.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
          })}
          .
        </p>
      ) : null}

      <SectionEditor
        sectionId={located.section.id}
        flavour={flavourForStoryType(located.storyboard.type)}
        initialContent={initialContent}
        baseRevisionId={detail.section.currentRevision?.id ?? null}
        canCommit={detail.permissions.canEdit}
        returnHref={returnHref}
      />
    </main>
  )
}
