'use client'

import { Button } from '@storyboard/ui/components/button'
import { Label } from '@storyboard/ui/components/label'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from '@/components/link'
import { useState } from 'react'

import { nameOf } from '@/lib/people'
import { PUBLICATION_NOTE_MAX_CHARS } from '@/lib/schemas/constants'
import { formatInZone } from '@/lib/time-zone'
import { useTRPC } from '@/trpc/client'
import type { AppRouter } from '@/server/trpc/routers/_app'
import type { inferRouterOutputs } from '@trpc/server'

type Edition = inferRouterOutputs<AppRouter>['publication']['list']['editions'][number]

/**
 * Decision 0044 (phase 14, items 7b.1 and 7b.2) — published editions: the
 * list, and for the owner the way to put out the next one. Publishing cannot
 * be undone, and it puts the words in front of strangers, so it is said in
 * full before the button that does it, as every other irreversible action is
 * (milestone 5).
 */
export function EditionsPanel({
  slug,
  storyboardId,
  initialEditions,
  canPublish,
  timeZone,
}: {
  slug: string
  storyboardId: string
  initialEditions: Edition[]
  canPublish: boolean
  timeZone: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const listOptions = trpc.publication.list.queryOptions({ storyboardId })
  const { data } = useQuery(listOptions)
  const editions = data?.editions ?? initialEditions
  const next = (editions[0]?.number ?? 0) + 1

  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState('')
  const publish = useMutation(
    trpc.publication.publish.mutationOptions({
      onSuccess: async () => {
        setConfirming(false)
        setNote('')
        await queryClient.invalidateQueries({ queryKey: listOptions.queryKey })
      },
    }),
  )

  return (
    <section className="mt-10 border-t border-rule pt-6">
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Published editions
      </h2>
      <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
        An edition is the main draft as it stands when it is published. Readers find the newest at{' '}
        <Link href={`/s/${slug}/published`} className="text-pencil hover:underline">
          its own address
        </Link>
        , and the working draft goes on changing behind it. An edition is never changed and never
        taken back; publishing again makes the next one.
      </p>

      {editions.length === 0 ? (
        <p className="mt-3 text-[13.5px] text-ink-faint">Nothing has been published yet.</p>
      ) : (
        <ol aria-label="Published editions" className="mt-3 space-y-2">
          {editions.map((edition) => (
            <li key={edition.number} className="text-[13.5px] leading-relaxed text-ink-soft">
              <Link
                href={`/s/${slug}/published/${String(edition.number)}`}
                className="text-pencil hover:underline"
              >
                Edition {edition.number}
              </Link>
              {' — '}
              <time dateTime={edition.publishedAt.toISOString()}>
                {formatInZone(edition.publishedAt, 'long', timeZone)}
              </time>
              , by {nameOf(edition.publishedBy)}
              {edition.note ? <span className="italic"> — {edition.note}</span> : null}
            </li>
          ))}
        </ol>
      )}

      {canPublish ? (
        confirming ? (
          <div className="mt-4 border-l-2 border-pencil bg-pencil-wash/40 py-3 pl-4">
            <Label htmlFor="edition-note" className="text-[13px]">
              What changed since the last edition? (optional)
            </Label>
            <Textarea
              id="edition-note"
              rows={2}
              maxLength={PUBLICATION_NOTE_MAX_CHARS}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1.5"
            />
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink">
              Publish the main draft as it stands as edition {next}? Anyone who can read this story
              can read the edition, and it cannot be changed or taken back.
            </p>
            {publish.error ? (
              <p role="alert" className="mt-2 text-[12.5px] text-crimson">
                {publish.error.message}
              </p>
            ) : null}
            <div className="mt-2.5 flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={publish.isPending}
                onClick={() => publish.mutate({ storyboardId, note: note.trim() || undefined })}
              >
                {publish.isPending ? 'Publishing…' : `Publish edition ${String(next)}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button className="mt-4" size="sm" onClick={() => setConfirming(true)}>
            Publish an edition
          </Button>
        )
      ) : (
        <p className="mt-3 text-[12.5px] text-ink-faint">
          The story&rsquo;s owner publishes its editions.
        </p>
      )}
    </section>
  )
}
