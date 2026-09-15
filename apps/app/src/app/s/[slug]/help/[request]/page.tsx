import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { auth } from '@/auth'
import { Manuscript } from '@/components/manuscript'
import { flavourForStoryType } from '@/lib/doc/schema'
import { REQUEST_KINDS, REQUEST_STATE_LABELS } from '@/lib/schemas/help'
import { caller } from '@/trpc/server'

import { IdeaThread } from './idea-thread'
import { RequestActions } from './request-actions'
import { SuggestionList } from './suggestion-list'

type Params = { params: Promise<{ slug: string; request: string }> }

export const dynamic = 'force-dynamic'

async function load(publicId: string) {
  try {
    return await caller.request.get({ publicId })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { request } = await params
  const data = await load(request)
  return { title: data.request.title }
}

/** Screen 8 — the ask, the context, and everything that has come back. */
export default async function RequestPage({ params }: Params) {
  const { slug, request: publicId } = await params
  const data = await load(publicId)
  const session = await auth()
  const { request, permissions } = data

  const kind = REQUEST_KINDS.find((option) => option.value === request.kind)!
  const flavour = flavourForStoryType(request.storyboard.type)
  const signedIn = Boolean(session?.user)

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {request.storyboard.title}
        </Link>
        <span aria-hidden> / </span>
        <span>
          {request.section.chapter.order + 1}. {request.section.chapter.title}
        </span>
      </nav>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-ochre/40 bg-ochre-wash px-2 py-0.5 text-[11.5px] tracking-wide text-ochre uppercase">
            {kind.label}
          </span>
          <span className="text-[12.5px] text-ink-faint">
            {REQUEST_STATE_LABELS[request.state]}
          </span>
        </div>

        <h1 className="mt-3 font-manuscript text-[30px] leading-tight font-medium text-ink">
          {request.title}
        </h1>
        <p className="mt-2 text-[13px] text-ink-faint">
          opened by {request.openedBy.displayName ?? request.openedBy.username ?? 'the author'} ·{' '}
          <time dateTime={request.createdAt.toISOString()}>
            {request.createdAt.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </time>
          {kind.returns === 'prose'
            ? ` · ${String(request.minWords)}–${String(request.maxWords)} words`
            : null}
        </p>
      </header>

      <section className="mt-8">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          What is wrong
        </h2>
        <p className="manuscript mt-3 max-w-measure whitespace-pre-line">{request.ask}</p>
      </section>

      {/* FR-5.4 — the whole point: you can help from this alone. */}
      {request.preContext ? (
        <section className="mt-8">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
            The story so far
          </h2>
          <p className="manuscript mt-3 max-w-measure whitespace-pre-line text-ink-soft">
            {request.preContext}
          </p>
        </section>
      ) : null}

      {request.toneNotes ? (
        <section className="mt-8">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
            Tone and characters
          </h2>
          <p className="mt-3 max-w-measure text-[14px] leading-relaxed whitespace-pre-line text-ink-soft">
            {request.toneNotes}
          </p>
        </section>
      ) : null}

      {/* FR-5.6 — constraints, as a checklist. */}
      {request.constraints.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
            Must hold
          </h2>
          <ul className="mt-3 space-y-1.5">
            {request.constraints.map((constraint, index) => (
              <li key={index} className="flex items-start gap-2.5 text-[14px] text-ink">
                <span aria-hidden className="mt-0.5 text-ochre">
                  ▢
                </span>
                {constraint}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* FR-5.5 — inline and in order, never links that navigate away. */}
      {data.readingList.length > 0 ? (
        <section className="mt-8">
          <details className="border border-rule bg-paper-sunk">
            <summary className="cursor-pointer px-4 py-3 text-[13.5px] text-ink">
              Worth reading first ({data.readingList.length}{' '}
              {data.readingList.length === 1 ? 'section' : 'sections'})
            </summary>
            <div className="border-t border-rule px-4 py-4">
              {data.readingList.map((section) => (
                <article key={section.lineageId} className="mb-8 last:mb-0">
                  <h3 className="text-[12px] tracking-wide text-ink-faint uppercase">
                    {section.chapter.order + 1}. {section.chapter.title}
                    {section.title ? ` — ${section.title}` : ''}
                  </h3>
                  <div className="manuscript mt-2 max-w-measure">
                    <Manuscript content={section.currentRevision?.contentJson} flavour={flavour} />
                  </div>
                </article>
              ))}
            </div>
          </details>
        </section>
      ) : null}

      <RequestActions
        slug={slug}
        requestId={request.id}
        requestPublicId={request.publicId}
        state={request.state}
        kind={request.kind}
        canDecide={permissions.canOpenRequest}
        canContribute={permissions.canSubmitSuggestion}
        signedIn={signedIn}
      />

      {kind.returns === 'prose' ? (
        <SuggestionList
          slug={slug}
          requestPublicId={request.publicId}
          suggestions={data.suggestions}
          canDecide={permissions.canOpenRequest}
          viewerId={session?.user.id ?? null}
        />
      ) : (
        <IdeaThread
          requestId={request.id}
          ideas={data.ideas}
          canDecide={permissions.canOpenRequest}
          canPost={permissions.canPostIdea}
          signedIn={signedIn}
          hasHelpfulIdea={data.hasHelpfulIdea}
          viewerId={session?.user?.id ?? null}
        />
      )}
    </main>
  )
}
