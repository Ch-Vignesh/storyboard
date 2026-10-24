import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'
import { notFound, redirect } from 'next/navigation'

import { auth } from '@/auth'
import { Manuscript } from '@/components/manuscript'
import { flavourForStoryType } from '@/lib/doc/schema'
import { caller } from '@/trpc/server'

import { SuggestionComposer } from './suggestion-composer'

type Params = {
  params: Promise<{ slug: string; request: string }>
  /** Item 6.7 — `?change=<suggestion>` opens a sent suggestion for changing. */
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Write a suggestion' }

/** Screen 9 — constraints pinned, word counter live, the text it follows in view. */
export default async function ComposerPage({ params, searchParams }: Params) {
  const { slug, request: publicId } = await params
  const { change } = await searchParams
  const session = await auth()
  if (!session?.user) redirect(`/signin?next=/s/${slug}/help/${publicId}/write`)

  let data
  try {
    data = await caller.request.get({ publicId })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const mine = data.suggestions.find(
    (suggestion) => suggestion.contributor.id === session.user.id && suggestion.state === 'DRAFT',
  )
  // Item 6.7 (D-12) — a sent suggestion of the person's own, changed here
  // until an author opens it. Anything else about the address goes back to
  // the request; an opened one is told why.
  let draft
  if (typeof change === 'string') {
    const found = await caller.suggestion.get({ publicId: change }).catch(() => null)
    const sent =
      found?.suggestion.contributor.id === session.user.id &&
      found.suggestion.request.publicId === publicId &&
      found.suggestion.state === 'SUBMITTED'
        ? found
        : null
    if (!sent) redirect(`/s/${slug}/help/${publicId}`)
    if (sent.suggestion.openedAt) {
      return (
        <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-12">
          <h1 className="font-manuscript text-[24px] leading-tight font-medium text-ink">
            This cannot change now
          </h1>
          <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
            The author has started reading it, so it can&rsquo;t change now. Withdraw it and send a
            new one.
          </p>
          <p className="mt-6 text-[13.5px]">
            <Link href={`/s/${slug}/help/${publicId}`} className="text-pencil hover:underline">
              Back to the request
            </Link>
          </p>
        </main>
      )
    }
    draft = sent
  } else {
    // Reaching the composer without a draft means the request was never started.
    if (!mine) redirect(`/s/${slug}/help/${publicId}`)
    draft = await caller.suggestion.get({ publicId: mine.publicId })
  }
  const section = await caller.section.get({ sectionId: data.request.section.id })
  const flavour = flavourForStoryType(data.request.storyboard.type)
  const continues = data.request.kind === 'CONTINUE'
  const current = section.section.currentRevision

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {data.request.storyboard.title}
        </Link>
        <span aria-hidden> / </span>
        <Link href={`/s/${slug}/help/${publicId}`} className="hover:text-ink hover:underline">
          {data.request.title}
        </Link>
      </nav>

      {/* What this is written to follow, kept in view while it is written.
          A continuation was written blind to the opening it follows until
          the 2026-10-16 spec review: the composer showed neither the story so
          far (FR-5.4) nor the section. Open for a continuation; a rewrite
          starts from the section's text, so there it is only a reference. */}
      {data.request.preContext || (current && current.wordCount > 0) ? (
        <div className="mb-8 max-w-measure space-y-3 border-b border-rule pb-6">
          {data.request.preContext ? (
            <details open={continues}>
              <summary className="cursor-pointer text-[12px] font-medium tracking-wide text-ink-faint uppercase">
                The story so far
              </summary>
              <p className="manuscript mt-3 whitespace-pre-line text-ink-soft">
                {data.request.preContext}
              </p>
            </details>
          ) : null}
          {current && current.wordCount > 0 ? (
            <details open={continues}>
              <summary className="cursor-pointer text-[12px] font-medium tracking-wide text-ink-faint uppercase">
                {continues ? 'What yours will follow' : 'The section as it stands'}
              </summary>
              <div className="manuscript mt-3 text-ink-soft">
                <Manuscript content={current.contentJson} flavour={flavour} />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      <SuggestionComposer
        suggestionId={draft.suggestion.id}
        flavour={flavour}
        initialContent={draft.suggestion.contentJson}
        initialNote={draft.suggestion.note ?? ''}
        constraints={data.request.constraints}
        toneNotes={data.request.toneNotes}
        characterNotes={data.request.characterNotes}
        ask={data.request.ask}
        allowance={await caller.suggestion
          .allowance({ storyboardId: data.request.storyboard.id })
          .catch(() => null)}
        minWords={data.request.minWords}
        maxWords={data.request.maxWords}
        baseRevisionId={draft.suggestion.baseRevisionId}
        headRevisionId={current?.id ?? null}
        rewrite={!continues}
        change={typeof change === 'string'}
        requestTitle={data.request.title}
        backHref={`/s/${slug}/help/${publicId}`}
        savedAt={draft.suggestion.updatedAt.toISOString()}
      />
    </main>
  )
}
