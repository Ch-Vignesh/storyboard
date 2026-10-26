'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import Link from '@/components/link'
import { UserAvatar } from '@/components/user-avatar'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { PASS_CHIPS, suggestionStateLabel } from '@/lib/schemas/help'
import { formatInZone } from '@/lib/time-zone'
import { useTRPC } from '@/trpc/client'

type Suggestion = {
  id: string
  publicId: string
  state: 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'PASSED' | 'STALE' | 'WITHDRAWN'
  note: string | null
  wordCount: number
  passReason: string | null
  submittedAt: Date | null
  /** Item 6.7 — changeable by its writer until an author opens it. */
  openedAt: Date | null
  editedAt: Date | null
  contributor: { id: string; username: string | null; displayName: string | null }
}

/** What has come back, and what the author can do about it (FR-6.4, FR-6.11). */
export function SuggestionList({
  slug,
  requestId,
  requestPublicId,
  suggestions,
  requestState,
  canDecide,
  viewerId,
  timeZone,
}: {
  slug: string
  requestId: string
  requestPublicId: string
  suggestions: Suggestion[]
  requestState: string
  canDecide: boolean
  viewerId: string | null
  /** D-12 — "edited" says when, in the reader's zone (item 1.18). */
  timeZone: string
}) {
  // FR-5.10 — closed without accepting: nothing here can be decided, sent,
  // updated or taken back until the author opens it again.
  const closed = requestState === 'CLOSED'
  const trpc = useTRPC()
  const router = useRouter()
  const refresh = () => router.refresh()

  // Item 5.6 (FR-6.5) — withdrawing asks first; afterwards a new draft can
  // start from the withdrawn words.
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null)
  const [withdrawn, setWithdrawn] = useState<string | null>(null)
  const withdraw = useMutation(
    trpc.suggestion.withdraw.mutationOptions({
      onSuccess: (_result, variables) => {
        setWithdrawn(variables.suggestionId)
        setConfirmWithdraw(null)
        refresh()
      },
    }),
  )
  const startDraft = useMutation(
    trpc.suggestion.startDraft.mutationOptions({
      onSuccess: () => router.push(`/s/${slug}/help/${requestPublicId}/write`),
    }),
  )
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
                      <UserAvatar
                        person={suggestion.contributor}
                        size="sm"
                        className="mr-2 align-middle"
                      />
                      {mine ? 'You' : name}
                      <span className="text-ink-faint"> · {suggestion.wordCount} words</span>
                      <StateBadge state={suggestion.state} requestState={requestState} />
                      {/* D-12 (item 6.7) — changed after it was sent. */}
                      {suggestion.editedAt ? (
                        <span className="text-ink-faint">
                          {' '}
                          · edited {formatInZone(suggestion.editedAt, 'shortTime', timeZone)}
                        </span>
                      ) : null}
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
                    {suggestion.state === 'DRAFT' && mine && !closed ? (
                      <Button asChild size="sm" variant="primary">
                        <Link href={`/s/${slug}/help/${requestPublicId}/write`}>
                          Finish your draft
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant={canDecide ? 'primary' : 'default'}>
                        <Link href={`/s/${slug}/help/${requestPublicId}/s/${suggestion.publicId}`}>
                          {canDecide && suggestion.state === 'SUBMITTED' && !closed
                            ? 'Read and decide'
                            : 'Read it'}
                        </Link>
                      </Button>
                    )}

                    {/* FR-6.7 — a stale suggestion can be updated and sent again
                        without costing another quota slot. */}
                    {mine && suggestion.state === 'STALE' && !closed ? (
                      <Button
                        size="sm"
                        disabled={rebase.isPending}
                        onClick={() => rebase.mutate({ suggestionId: suggestion.id })}
                      >
                        Update it against the new text
                      </Button>
                    ) : null}

                    {/* Item 6.7 (D-12) — until an author opens it, its writer may change it. */}
                    {mine && suggestion.state === 'SUBMITTED' && !suggestion.openedAt && !closed ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          href={`/s/${slug}/help/${requestPublicId}/write?change=${suggestion.publicId}`}
                        >
                          Change it
                        </Link>
                      </Button>
                    ) : null}
                    {mine && suggestion.state === 'SUBMITTED' && !closed ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={withdraw.isPending}
                        onClick={() => setConfirmWithdraw(suggestion.id)}
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

      {withdrawn ? (
        <p role="status" className="mt-4 text-[13.5px] text-ink-soft">
          Withdrawn. The author no longer sees it.{' '}
          <button
            type="button"
            className="text-pencil hover:underline disabled:text-ink-faint"
            disabled={startDraft.isPending}
            onClick={() => startDraft.mutate({ requestId, from: withdrawn })}
          >
            Start a new draft from it
          </button>
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmWithdraw !== null}
        title="Withdraw this suggestion?"
        confirmLabel="Withdraw it"
        busy={withdraw.isPending}
        error={withdraw.error}
        onCancel={() => setConfirmWithdraw(null)}
        onConfirm={() => {
          if (confirmWithdraw) withdraw.mutate({ suggestionId: confirmWithdraw })
        }}
      >
        <p>It frees a slot on this request, and the author no longer sees it.</p>
        <p>You can start a new draft from it afterwards, with its words already in place.</p>
        {(() => {
          // Item 6.7 — while the author has not opened it, changing it is the
          // smaller step, and is offered here too.
          const confirming = suggestions.find((entry) => entry.id === confirmWithdraw)
          return confirming && !confirming.openedAt ? (
            <p>
              Or{' '}
              <Link
                href={`/s/${slug}/help/${requestPublicId}/write?change=${confirming.publicId}`}
                className="text-pencil hover:underline"
              >
                change it instead
              </Link>
              : the author has not opened it yet.
            </p>
          ) : null
        })()}
      </ConfirmDialog>

      {withdraw.isError || rebase.isError || startDraft.isError ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {(withdraw.error ?? rebase.error ?? startDraft.error)?.message}
        </p>
      ) : null}
    </section>
  )
}

function StateBadge({ state, requestState }: { state: Suggestion['state']; requestState: string }) {
  const label = suggestionStateLabel(state, requestState)
  const tone =
    state === 'ACCEPTED'
      ? 'border-moss/40 bg-moss-wash text-moss'
      : state === 'PASSED' || label === 'not accepted'
        ? 'border-rule bg-paper-sunk text-ink-faint'
        : state === 'STALE'
          ? 'border-ochre/40 bg-ochre-wash text-ochre'
          : 'border-pencil/30 bg-pencil-wash text-pencil'

  return <span className={`ml-2 border px-1.5 py-0.5 text-[11px] ${tone}`}>{label}</span>
}
