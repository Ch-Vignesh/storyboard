import type { Metadata } from 'next'
import Link from '@/components/link'
import { notFound } from 'next/navigation'

import { auth } from '@/auth'
import { SectionEditor } from '@/components/section-editor'
import { flavourForStoryType, parseDoc } from '@/lib/doc/schema'
import { derive } from '@/lib/doc/text'
import { readTimeZone } from '@/lib/dates'
import { formatInZone } from '@/lib/time-zone'
import { caller } from '@/trpc/server'

import { locate } from '../../locate'
import { DiscardDraftButton } from './discard-draft-button'

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
  const timeZone = await readTimeZone()
  const { slug, chapter: chapterNo, section: sectionNo } = await params
  const { version } = (await searchParams) ?? {}
  const located = await locate(slug, chapterNo, sectionNo, version)

  // Carried on every link out of here, so a writer stays in the draft they
  // opened rather than being returned to the main one.
  const suffix = located.version.isMain ? '' : `?version=${encodeURIComponent(located.version.id)}`

  const detail = await caller.section.get({ sectionId: located.section.id })
  if (!detail.permissions.canEdit && !detail.permissions.canSubmitSuggestion) notFound()

  // Item 8.1 — back to this section's own address, which opens its chapter
  // and scrolls to it, not to chapter one.
  const returnHref = `/s/${slug}/c/${chapterNo}/${sectionNo}${suffix}`
  // And on through the story, a section at a time, across chapters.
  const order = located.data.chapters.flatMap((chapter, chapterIndex) =>
    chapter.sections.map((section, sectionIndex) => ({
      href: `/s/${slug}/c/${String(chapterIndex + 1)}/${String(sectionIndex + 1)}/edit${suffix}`,
      label:
        section.title ?? `chapter ${String(chapterIndex + 1)}, section ${String(sectionIndex + 1)}`,
      id: section.id,
    })),
  )
  const here = order.findIndex((entry) => entry.id === located.section.id)
  const previous = here > 0 ? order[here - 1] : undefined
  const next = here >= 0 ? order[here + 1] : undefined
  const flavour = flavourForStoryType(located.storyboard.type)
  const head = detail.section.currentRevision
  // A draft overtaken by somebody else's save (section.get decides). Opening
  // it over their text and saving would replace their words without a word
  // of warning: the save checks against the text it was opened on, and that
  // was theirs (phase 12 audit). So the editor opens on their version, and
  // the draft is shown beside it, kept, for this person to take from.
  const draftIsBehind = detail.draft?.behind ?? false
  // FR-4.4 — otherwise a draft outranks the saved text: it is what this person
  // was last writing, and losing it on reload is what autosave exists to prevent.
  const initialContent = draftIsBehind
    ? head?.contentJson
    : (detail.draft?.contentJson ?? head?.contentJson)
  const draftText =
    draftIsBehind && detail.draft
      ? derive(parseDoc(detail.draft.contentJson, flavour)).contentText
      : null

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
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

      {draftText !== null && detail.draft ? (
        <div className="mb-5 border-l-2 border-ochre bg-ochre-wash px-4 py-3 text-[13px] text-ink">
          <p>
            This section was changed after the draft you left on{' '}
            {formatInZone(detail.draft.updatedAt, 'dayMonth', timeZone)}. The editor shows the
            current text, so nothing of theirs is lost. Your draft is kept here to copy from.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-pencil">Show your draft</summary>
            <p className="mt-2 font-manuscript text-[14px] leading-relaxed whitespace-pre-wrap">
              {draftText}
            </p>
          </details>
          <DiscardDraftButton sectionId={located.section.id} />
        </div>
      ) : detail.draft ? (
        <p className="mb-5 border-l-2 border-pencil bg-pencil-wash px-4 py-2.5 text-[13px] text-ink">
          Picking up the draft you left on{' '}
          {formatInZone(detail.draft.updatedAt, 'dayMonth', timeZone)}.
        </p>
      ) : null}

      <SectionEditor
        sectionId={located.section.id}
        flavour={flavour}
        initialContent={initialContent}
        baseRevisionId={detail.section.currentRevision?.id ?? null}
        canCommit={detail.permissions.canEdit}
        startsUnsaved={Boolean(detail.draft) && !draftIsBehind}
        returnHref={returnHref}
        previous={previous ? { href: previous.href, label: previous.label } : null}
        next={next ? { href: next.href, label: next.label } : null}
        // Item 8.5 — what this opened on, so a newer copy on the device is offered back.
        savedAt={
          (draftIsBehind || !detail.draft
            ? head?.createdAt
            : detail.draft.updatedAt
          )?.toISOString() ?? null
        }
        contentsHref={`/s/${slug}/contents${suffix}`}
        // Item 8.5 — whose words the device keeps: on a shared computer the
        // next person to sign in is not offered them.
        writerId={(await auth())?.user?.id ?? 'guest'}
      />
    </main>
  )
}
