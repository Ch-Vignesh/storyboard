import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'
import { notFound, redirect } from 'next/navigation'

import { PASS_CHIPS, suggestionStateLabel, waitsOnClosedRequest } from '@/lib/schemas/help'
import { CopyLink } from '@/components/copy-link'
import { ReportButton } from '@/components/report-button'
import { readTimeZone } from '@/lib/dates'
import { orNotFound, suggestionMetadata } from '@/lib/metadata'
import { formatInZone } from '@/lib/time-zone'
import { caller } from '@/trpc/server'

import { DecisionPanel } from './decision-panel'

type Params = { params: Promise<{ slug: string; request: string; suggestion: string }> }

export const dynamic = 'force-dynamic'

// Items 9.6 and 9.8 — named for its writer and its story, and never indexed.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { suggestion } = await params
  return orNotFound(suggestionMetadata(caller, suggestion))
}

/** Screen 10 — side by side, accept or pass at the foot (FR-7, FR-6.10). */
export default async function SuggestionPage({ params }: Params) {
  const timeZone = await readTimeZone()
  const { slug, request: requestPublicId, suggestion: suggestionPublicId } = await params

  let data
  try {
    data = await caller.suggestion.get({ publicId: suggestionPublicId })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const { suggestion, permissions, proofRevisionId } = data
  // At its own request's and story's address only, as the request page.
  const own = suggestion.request
  if (own.storyboard.slug !== slug || own.publicId !== requestPublicId) {
    redirect(`/s/${own.storyboard.slug}/help/${own.publicId}/s/${suggestionPublicId}`)
  }
  // Hidden after a report (item 2.7, decision 0045): no comparison for anyone
  // but the writer and a moderator; the page says what happened instead.
  const comparison = suggestion.redacted
    ? null
    : await caller.compare.suggestionAgainstHead({ suggestionId: suggestion.id })
  const name =
    suggestion.contributor.displayName ?? suggestion.contributor.username ?? 'a contributor'
  const closed = waitsOnClosedRequest(suggestion.state, suggestion.request.state)

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-10">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {suggestion.request.storyboard.title}
        </Link>
        <span aria-hidden> / </span>
        <Link
          href={`/s/${slug}/help/${requestPublicId}`}
          className="hover:text-ink hover:underline"
        >
          {suggestion.request.title}
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="font-manuscript text-[26px] leading-tight font-medium text-ink">
          {name}&rsquo;s suggestion
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-faint">
          {suggestion.wordCount} words ·{' '}
          {suggestionStateLabel(suggestion.state, suggestion.request.state)}
          {suggestion.submittedAt
            ? ` · sent ${formatInZone(suggestion.submittedAt, 'dayMonth', timeZone)}`
            : null}
          {/* D-12 (item 6.7) — changed after it was sent, and when. */}
          {suggestion.editedAt
            ? ` · edited ${formatInZone(suggestion.editedAt, 'dateTime', timeZone)}`
            : null}
          {' · '}
          {/* Item 6.11 — its own address, which is permanent (FR-9.4). */}
          <CopyLink path={`/s/${slug}/help/${requestPublicId}/s/${suggestionPublicId}`} />
        </p>

        {/* FR-6.2 — the note goes above the prose, where it is read first. */}
        {suggestion.note ? (
          <p className="mt-4 max-w-measure border-l-2 border-pencil bg-pencil-wash px-4 py-3 text-[14px] leading-relaxed text-ink italic">
            {suggestion.note}
          </p>
        ) : null}

        {/* FR-5.10 — closed without accepting, and still readable. */}
        {closed ? (
          <p className="mt-4 text-[13.5px] text-ink-soft">
            The request was closed without accepting this. It stays here, and on {name}&rsquo;s
            profile.
          </p>
        ) : null}

        {suggestion.hidden && !suggestion.redacted ? (
          <p className="mt-4 border-l-2 border-crimson bg-paper-sunk px-4 py-3 text-[13.5px] leading-relaxed text-ink">
            Hidden after a report: it reads as removed to everyone but its writer and the
            moderators, and it cannot be accepted. Nothing has been deleted.
          </p>
        ) : null}

        {/* FR-6.7 — written against text that has since moved. */}
        {comparison?.isStale && !closed ? (
          <p className="mt-4 border-l-2 border-ochre bg-ochre-wash px-4 py-3 text-[13.5px] leading-relaxed text-ink">
            {suggestion.request.kind === 'CONTINUE'
              ? 'This was written to follow an earlier version of the section, which has changed since. Accepting it puts it after that version’s text, in place of what has been added since: the comparison below shows exactly what changes.'
              : 'This was written against an earlier version of the section, which has changed since. Accepting it will replace the current text with this one.'}
          </p>
        ) : null}

        {suggestion.state === 'PASSED' && suggestion.passReason ? (
          <p className="mt-4 text-[13.5px] text-ink-soft">
            {PASS_CHIPS.find((chip) => chip.value === suggestion.passReason)?.label}. It stays here,
            and on {name}&rsquo;s profile.
          </p>
        ) : null}

        {/* Item 8.12 (FR-13.6) — to its writer, once it is in the story. */}
        {proofRevisionId ? (
          <p className="mt-4 text-[13.5px]">
            <Link href={`/proof/${proofRevisionId}`} className="text-pencil hover:underline">
              Proof that you wrote this
            </Link>
          </p>
        ) : null}
      </header>

      {comparison ? (
        <DecisionPanel
          suggestionId={suggestion.id}
          state={suggestion.state}
          comparison={comparison}
          contributorName={name}
          // A closed request takes no decision until it is opened again.
          canDecide={permissions.canOpenRequest && !closed}
          continues={suggestion.request.kind === 'CONTINUE'}
          headRevisionId={comparison.headRevisionId}
          backHref={`/s/${slug}/help/${requestPublicId}`}
        />
      ) : (
        <p className="mt-6 max-w-measure font-manuscript text-[17px] leading-relaxed text-ink-faint italic">
          {suggestion.contentText}
        </p>
      )}

      {/* FR-13.5 — the person deciding on a suggestion is the person best
          placed to say it should not have been sent. */}
      <section className="mt-10 border-t border-rule pt-6">
        <ReportButton targetType="SUGGESTION" targetId={suggestion.id} />
      </section>
    </main>
  )
}
