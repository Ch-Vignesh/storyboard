import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { auth } from '@/auth'
import { flavourForStoryType } from '@/lib/doc/schema'
import { caller } from '@/trpc/server'

import { SuggestionComposer } from './suggestion-composer'

type Params = { params: Promise<{ slug: string; request: string }> }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Write a suggestion' }

/** Screen 9 — constraints pinned, word counter live, current text alongside. */
export default async function ComposerPage({ params }: Params) {
  const { slug, request: publicId } = await params
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
  // Reaching the composer without a draft means the request was never started.
  if (!mine) redirect(`/s/${slug}/help/${publicId}`)

  const draft = await caller.suggestion.get({ publicId: mine.publicId })

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {data.request.storyboard.title}
        </Link>
        <span aria-hidden> / </span>
        <Link href={`/s/${slug}/help/${publicId}`} className="hover:text-ink hover:underline">
          {data.request.title}
        </Link>
      </nav>

      <SuggestionComposer
        suggestionId={draft.suggestion.id}
        flavour={flavourForStoryType(data.request.storyboard.type)}
        initialContent={draft.suggestion.contentJson}
        constraints={data.request.constraints}
        toneNotes={data.request.toneNotes}
        minWords={data.request.minWords}
        maxWords={data.request.maxWords}
        requestTitle={data.request.title}
        backHref={`/s/${slug}/help/${publicId}`}
      />
    </main>
  )
}
