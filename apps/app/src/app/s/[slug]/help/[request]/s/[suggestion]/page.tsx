import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PASS_CHIPS, SUGGESTION_STATE_LABELS } from '@/lib/schemas/help'
import { ReportButton } from '@/components/report-button'
import { caller } from '@/trpc/server'

import { DecisionPanel } from './decision-panel'

type Params = { params: Promise<{ slug: string; request: string; suggestion: string }> }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Comparison' }

/** Screen 10 — side by side, accept or pass at the foot (FR-7, FR-6.10). */
export default async function SuggestionPage({ params }: Params) {
  const { slug, request: requestPublicId, suggestion: suggestionPublicId } = await params

  let data
  try {
    data = await caller.suggestion.get({ publicId: suggestionPublicId })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const comparison = await caller.compare.suggestionAgainstHead({
    suggestionId: data.suggestion.id,
  })

  const { suggestion, permissions } = data
  const name =
    suggestion.contributor.displayName ?? suggestion.contributor.username ?? 'a contributor'

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
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
          {suggestion.wordCount} words · {SUGGESTION_STATE_LABELS[suggestion.state]}
          {suggestion.submittedAt
            ? ` · sent ${suggestion.submittedAt.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
              })}`
            : null}
        </p>

        {/* FR-6.2 — the note goes above the prose, where it is read first. */}
        {suggestion.note ? (
          <p className="mt-4 max-w-measure border-l-2 border-pencil bg-pencil-wash px-4 py-3 text-[14px] leading-relaxed text-ink italic">
            {suggestion.note}
          </p>
        ) : null}

        {/* FR-6.7 — written against text that has since moved. */}
        {comparison.isStale ? (
          <p className="mt-4 border-l-2 border-ochre bg-ochre-wash px-4 py-3 text-[13.5px] leading-relaxed text-ink">
            This was written against an earlier version of the section, which has changed since.
            Accepting it will replace the current text with this one.
          </p>
        ) : null}

        {suggestion.state === 'PASSED' && suggestion.passReason ? (
          <p className="mt-4 text-[13.5px] text-ink-soft">
            {PASS_CHIPS.find((chip) => chip.value === suggestion.passReason)?.label}. It stays here,
            and on {name}&rsquo;s profile.
          </p>
        ) : null}
      </header>

      <DecisionPanel
        suggestionId={suggestion.id}
        state={suggestion.state}
        comparison={comparison}
        contributorName={name}
        canDecide={permissions.canOpenRequest}
        isStale={comparison.isStale}
        backHref={`/s/${slug}/help/${requestPublicId}`}
      />

      {/* FR-13.5 — the person deciding on a suggestion is the person best
          placed to say it should not have been sent. */}
      <section className="mt-10 border-t border-rule pt-6">
        <ReportButton targetType="SUGGESTION" targetId={suggestion.id} />
      </section>
    </main>
  )
}
