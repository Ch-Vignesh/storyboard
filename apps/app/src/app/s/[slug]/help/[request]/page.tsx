import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'
import { notFound, redirect } from 'next/navigation'

import { auth } from '@/auth'
import { CopyLink } from '@/components/copy-link'
import { Manuscript } from '@/components/manuscript'
import { flavourForStoryType } from '@/lib/doc/schema'
import { closesOn, REQUEST_KINDS, REQUEST_STATE_LABELS } from '@/lib/schemas/help'
import { readTimeZone } from '@/lib/dates'
import { orNotFound, requestMetadata } from '@/lib/metadata'
import { formatInZone } from '@/lib/time-zone'
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

// Item 9.6 — "{title} — a stuck point in {story}", read as this person reads the page.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { request } = await params
  return orNotFound(requestMetadata(caller, request))
}

/** Screen 8 — the ask, the context, and everything that has come back. */
export default async function RequestPage({ params }: Params) {
  const { slug, request: publicId } = await params
  const data = await load(publicId)
  const session = await auth()
  const { request, permissions, place } = data
  // At its own story's address only. Under another story's, the page framed
  // somebody's request as that story's, the example label included (the
  // 2026-10-26 final pass); a renamed story's old address lands here too.
  if (request.storyboard.slug !== slug) redirect(`/s/${request.storyboard.slug}/help/${publicId}`)

  const kind = REQUEST_KINDS.find((option) => option.value === request.kind)!
  const flavour = flavourForStoryType(request.storyboard.type)
  const signedIn = Boolean(session?.user)
  const timeZone = await readTimeZone()
  // Item 6.4 — what this person may still send here. Nothing for a guest or
  // an author; a refusal shows nothing rather than failing the page.
  const allowance =
    signedIn && permissions.canSubmitSuggestion
      ? await caller.suggestion.allowance({ storyboardId: request.storyboard.id }).catch(() => null)
      : null

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {request.storyboard.title}
        </Link>
        <span aria-hidden> / </span>
        {/* Item 7.2 — counted as the reader counts, and leading to the
            passage itself rather than to chapter one. A section that has
            left the main draft has no address, so its chapter is named only. */}
        {place ? (
          <>
            <Link
              href={place.path.replace(/\/\d+$/u, '')}
              className="hover:text-ink hover:underline"
            >
              {place.chapterNumber}. {place.chapter}
            </Link>
            <span aria-hidden> · </span>
            <Link href={place.path} className="text-pencil hover:underline">
              Read it in the story
            </Link>
          </>
        ) : (
          <span>{request.section.chapter.title}</span>
        )}
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
            {formatInZone(request.createdAt, 'long', timeZone)}
          </time>
          {kind.returns === 'prose'
            ? ` · ${String(request.minWords)}–${String(request.maxWords)} words`
            : null}
          {/* Item 6.1 — changed after it was opened, and by whom it may be changed. */}
          {request.editedAt ? (
            <>
              {' · edited '}
              <time dateTime={request.editedAt.toISOString()}>
                {formatInZone(request.editedAt, 'dayMonthShort', timeZone)}
              </time>
            </>
          ) : null}
          {permissions.canOpenRequest &&
          (request.state === 'OPEN' || request.state === 'ANSWERED') ? (
            <>
              {' · '}
              <Link
                href={`/s/${slug}/help/${request.publicId}/edit`}
                className="text-pencil hover:underline"
              >
                Change this request
              </Link>
            </>
          ) : null}
          {/* Item 6.15 (D-8) — from the day it opens, in the reader's zone. */}
          {request.state === 'OPEN' || request.state === 'ANSWERED' ? (
            <>
              {' · Closes on '}
              <time dateTime={closesOn(request.openedAt).toISOString()}>
                {formatInZone(closesOn(request.openedAt), 'long', timeZone)}
              </time>
            </>
          ) : null}
          {' · '}
          {/* Item 6.11 — its address, to hand to someone who might help. */}
          <CopyLink path={`/s/${slug}/help/${request.publicId}`} />
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
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">Tone</h2>
          <p className="mt-3 max-w-measure text-[14px] leading-relaxed whitespace-pre-line text-ink-soft">
            {request.toneNotes}
          </p>
        </section>
      ) : null}

      {/* FR-5.6 — constraints, as a checklist. */}
      {/* Item 6.2 (FR-5.6) — the people, apart from how it sounds. */}
      {request.characterNotes ? (
        <section className="mt-8">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
            Characters
          </h2>
          <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed whitespace-pre-line text-ink">
            {request.characterNotes}
          </p>
        </section>
      ) : null}

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
        finished={request.storyboard.state === 'FINISHED'}
        canDecide={permissions.canOpenRequest}
        canContribute={permissions.canSubmitSuggestion}
        signedIn={signedIn}
        blockedFromHelping={data.blockedFromHelping}
        allowance={allowance}
      />

      {kind.returns === 'prose' ? (
        <SuggestionList
          slug={slug}
          requestId={request.id}
          requestPublicId={request.publicId}
          suggestions={data.suggestions}
          requestState={request.state}
          canDecide={permissions.canOpenRequest}
          viewerId={session?.user.id ?? null}
          timeZone={timeZone}
        />
      ) : (
        <IdeaThread
          requestId={request.id}
          slug={slug}
          requestPublicId={request.publicId}
          timeZone={timeZone}
          ideas={data.ideas}
          canDecide={permissions.canOpenRequest}
          canPost={permissions.canPostIdea}
          signedIn={signedIn}
          blockedFromHelping={data.blockedFromHelping}
          hasHelpfulIdea={data.hasHelpfulIdea}
          viewerId={session?.user?.id ?? null}
          requestState={request.state}
          authorIds={data.authorIds}
        />
      )}
    </main>
  )
}
