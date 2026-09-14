'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { PASS_CHIPS, SUGGESTION_STATE_LABELS } from '@/lib/schemas/help'
import { useTRPC } from '@/trpc/client'

type Suggestion = {
  id: string
  publicId: string
  state: 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'PASSED' | 'STALE' | 'WITHDRAWN'
  note: string | null
  wordCount: number
  passReason: string | null
  submittedAt: Date | null
  contributor: { id: string; username: string | null; displayName: string | null }
}

/** What has come back, and what the author can do about it (FR-6.4, FR-6.11). */
export function SuggestionList({
  slug,
  requestPublicId,
  suggestions,
  canDecide,
  viewerId,
}: {
  slug: string
  requestPublicId: string
  suggestions: Suggestion[]
  canDecide: boolean
  viewerId: string | null
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const refresh = () => router.refresh()

  const withdraw = useMutation(trpc.suggestion.withdraw.mutationOptions({ onSuccess: refresh }))
  const rebase = useMutation(
    trpc.suggestion.rebase.mutationOptions({
      onSuccess: () => router.push(`/s/${slug}/help/${requestPublicId}/write`),
    }),
  )

  const live = suggestions.filter((suggestion) => suggestion.state !== 'WITHDRAWN')

  return (
    <section className="mt-10">
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Suggestions ({live.length})
      </h2>

      {live.length === 0 ? (
        <p className="mt-4 border border-rule bg-paper-sunk px-5 py-8 text-center text-[14px] text-ink-soft">
          Nothing yet. That is a normal state, not a failure.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {live.map((suggestion) => {
            const mine = suggestion.contributor.id === viewerId
            const name =
              suggestion.contributor.displayName ?? suggestion.contributor.username ?? 'someone'

            return (
              <li key={suggestion.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="text-[14px] text-ink">
                      {mine ? 'You' : name}
                      <span className="text-ink-faint"> · {suggestion.wordCount} words</span>
                      <StateBadge state={suggestion.state} />
                    </p>
                    {suggestion.note ? (
                      // FR-6.2 — the note goes above the prose, not below it.
                      <p className="mt-2 max-w-measure border-l-2 border-rule pl-3 text-[13.5px] leading-relaxed text-ink-soft italic">
                        {suggestion.note}
                      </p>
                    ) : null}
                    {suggestion.state === 'PASSED' && suggestion.passReason ? (
                      <p className="mt-1.5 text-[12.5px] text-ink-faint">
                        {PASS_CHIPS.find((chip) => chip.value === suggestion.passReason)?.label}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {suggestion.state === 'DRAFT' && mine ? (
                      <Button asChild size="sm" variant="primary">
                        <Link href={`/s/${slug}/help/${requestPublicId}/write`}>
                          Finish your draft
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant={canDecide ? 'primary' : 'default'}>
                        <Link href={`/s/${slug}/help/${requestPublicId}/s/${suggestion.publicId}`}>
                          {canDecide && suggestion.state === 'SUBMITTED'
                            ? 'Read and decide'
                            : 'Read it'}
                        </Link>
                      </Button>
                    )}

                    {/* FR-6.7 — a stale suggestion can be updated and sent again
                        without costing another quota slot. */}
                    {mine && suggestion.state === 'STALE' ? (
                      <Button
                        size="sm"
                        disabled={rebase.isPending}
                        onClick={() => rebase.mutate({ suggestionId: suggestion.id })}
                      >
                        Update it against the new text
                      </Button>
                    ) : null}

                    {mine && suggestion.state === 'SUBMITTED' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={withdraw.isPending}
                        onClick={() => withdraw.mutate({ suggestionId: suggestion.id })}
                      >
                        Withdraw
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {withdraw.isError || rebase.isError ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {(withdraw.error ?? rebase.error)?.message}
        </p>
      ) : null}
    </section>
  )
}

function StateBadge({ state }: { state: Suggestion['state'] }) {
  const tone =
    state === 'ACCEPTED'
      ? 'border-moss/40 bg-moss-wash text-moss'
      : state === 'STALE'
        ? 'border-ochre/40 bg-ochre-wash text-ochre'
        : state === 'PASSED'
          ? 'border-rule bg-paper-sunk text-ink-faint'
          : 'border-pencil/30 bg-pencil-wash text-pencil'

  return (
    <span className={`ml-2 border px-1.5 py-0.5 text-[11px] ${tone}`}>
      {SUGGESTION_STATE_LABELS[state]}
    </span>
  )
}
