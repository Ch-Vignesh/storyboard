'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useTRPC } from '@/trpc/client'

/**
 * FR-14.1 — marking a storyboard finished.
 *
 * Two things happen and the writer is told both before they choose: the reading
 * page loses its margin of requests, and any request still open is closed. The
 * second is the one worth stating plainly — somebody may be part-way through a
 * suggestion, and closing the door on them quietly would be the rudest thing
 * this product could do.
 *
 * Reversible in one click, because a finished novel with a typo in it is the
 * most ordinary thing in publishing.
 */
export function FinishedSwitch({
  storyboardId,
  slug,
  finished,
  finishedAt,
}: {
  storyboardId: string
  slug: string
  finished: boolean
  finishedAt: Date | null
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)

  const mark = useMutation(
    trpc.storyboard.markFinished.mutationOptions({
      onSuccess: () => {
        setConfirming(false)
        router.refresh()
      },
    }),
  )

  if (finished) {
    return (
      <div className="mt-3">
        <p className="max-w-measure text-[14px] leading-relaxed text-ink-soft">
          Marked finished
          {finishedAt
            ? ` on ${finishedAt.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}`
            : ''}
          . Its{' '}
          <a href={`/s/${slug}`} className="text-pencil hover:underline">
            reading page
          </a>{' '}
          has no margin and no request cards, and the contributors are linked from the foot.
        </p>
        {mark.error ? (
          <p role="alert" className="mt-2 text-[12.5px] text-crimson">
            {mark.error.message}
          </p>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="mt-3 -ml-2.5"
          disabled={mark.isPending}
          onClick={() => mark.mutate({ storyboardId, finished: false })}
        >
          {mark.isPending ? 'Reopening…' : 'Actually, there is more to do'}
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-3">
      <p className="max-w-measure text-[14px] leading-relaxed text-ink-soft">
        A finished storyboard gets a reading page with no margin and no request cards — the work
        rather than the workshop. Everything else stays: the history, the credits, and anything
        anyone has spun off.
      </p>

      {confirming ? (
        <div className="mt-3 border-l-2 border-pencil bg-pencil-wash/40 py-2.5 pl-4">
          <p className="max-w-measure text-[13.5px] leading-relaxed text-ink">
            Marking it finished closes any request still open. Anyone part-way through a suggestion
            will not be able to send it, so it is worth telling them first if you know they are
            there.
          </p>
          {mark.error ? (
            <p role="alert" className="mt-2 text-[12.5px] text-crimson">
              {mark.error.message}
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={mark.isPending}
              onClick={() => mark.mutate({ storyboardId, finished: true })}
            >
              {mark.isPending ? 'Marking it…' : 'Mark it finished'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Not yet
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="default" className="mt-3" onClick={() => setConfirming(true)}>
          Mark it finished
        </Button>
      )}
    </div>
  )
}
