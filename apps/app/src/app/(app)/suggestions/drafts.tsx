'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import Link from '@/components/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { formatInZone } from '@/lib/time-zone'
import { useTRPC } from '@/trpc/client'

export type OwnSuggestion = {
  id: string
  publicId: string
  wordCount: number
  updatedAt: Date
  request: { title: string; publicId: string; storyboard: { slug: string; title: string } }
}

/**
 * Phase 14, item 6.5 (FR-4.5, FR-6.1) — the suggestions of yours that are not
 * in an author's hands: drafts, which can be continued or thrown away (after
 * asking), and stale ones, which can be brought up to the new text. Until
 * this, a draft could be found again only by returning to its request, and
 * never thrown away.
 */
export function DraftsAndStale({
  drafts,
  stale,
  timeZone,
}: {
  drafts: OwnSuggestion[]
  stale: OwnSuggestion[]
  timeZone: string
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [discarding, setDiscarding] = useState<OwnSuggestion | null>(null)
  const discard = useMutation(
    trpc.suggestion.discardDraft.mutationOptions({
      onSuccess: () => {
        setDiscarding(null)
        router.refresh()
      },
    }),
  )
  const rebase = useMutation(
    trpc.suggestion.rebase.mutationOptions({
      onSuccess: (_updated, variables) => {
        const row = stale.find((entry) => entry.id === variables.suggestionId)
        if (row) router.push(composerPath(row))
      },
    }),
  )

  if (drafts.length === 0 && stale.length === 0) return null
  const error = discard.error ?? rebase.error

  return (
    <>
      {drafts.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
            Not sent yet
          </h2>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {drafts.map((draft) => (
              <li
                key={draft.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4"
              >
                <div className="min-w-0">
                  <p className="font-manuscript text-[17px] text-ink">{draft.request.title}</p>
                  <p className="mt-1 text-[12.5px] text-ink-faint">
                    {draft.request.storyboard.title}
                    {' · '}
                    {draft.wordCount.toLocaleString('en-GB')} words
                    {' · saved '}
                    {formatInZone(draft.updatedAt, 'dayMonthShort', timeZone)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button asChild size="sm">
                    <Link href={composerPath(draft)}>Continue</Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDiscarding(draft)}>
                    Throw away
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stale.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
            Needs updating
          </h2>
          <p className="mt-2 max-w-measure text-[13px] leading-relaxed text-ink-soft">
            The section changed after these were sent. Updating one brings it back to you as a draft
            on the new text, with your words as they were.
          </p>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {stale.map((suggestion) => (
              <li
                key={suggestion.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-4"
              >
                <div className="min-w-0">
                  <p className="font-manuscript text-[17px] text-ink">{suggestion.request.title}</p>
                  <p className="mt-1 text-[12.5px] text-ink-faint">
                    {suggestion.request.storyboard.title}
                    {' · '}
                    {suggestion.wordCount.toLocaleString('en-GB')} words
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={rebase.isPending}
                  onClick={() => rebase.mutate({ suggestionId: suggestion.id })}
                >
                  Update it
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {error.message}
        </p>
      ) : null}

      <ConfirmDialog
        open={discarding !== null}
        title="Throw this draft away?"
        confirmLabel="Throw it away"
        destructive
        busy={discard.isPending}
        onCancel={() => setDiscarding(null)}
        onConfirm={() => {
          if (discarding) discard.mutate({ suggestionId: discarding.id })
        }}
      >
        <p>Its words go for good. Nobody has read it, and nobody is told.</p>
      </ConfirmDialog>
    </>
  )
}

function composerPath(row: OwnSuggestion): string {
  return `/s/${row.request.storyboard.slug}/help/${row.request.publicId}/write`
}
