'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useTRPC } from '@/trpc/client'

/**
 * Decision 0013 — erase a contribution record.
 *
 * The confirmation has to be precise about a split that is not obvious: the
 * name goes, the writing stays. Somebody expecting their words to be pulled out
 * of another person's novel will be angry later if this screen let them believe
 * it, so it is spelled out before the button and cannot be undone after it.
 */
export function EraseCredit({
  creditId,
  storyboardTitle,
}: {
  creditId: string
  storyboardTitle: string
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const erase = useMutation(
    trpc.profile.eraseContribution.mutationOptions({
      onSuccess: () => {
        setOpen(false)
        router.refresh()
      },
    }),
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 text-[12.5px] text-ink-faint underline-offset-4 hover:text-ink hover:underline"
      >
        Erase my name from this
      </button>
    )
  }

  return (
    <div className="mt-2.5 border-l-2 border-crimson bg-paper-sunk py-2.5 pl-4">
      <p className="max-w-measure text-[13.5px] leading-relaxed text-ink">
        Your name comes off this contribution everywhere it appears, including in any spin-off of{' '}
        {storyboardTitle}, and it disappears from this profile. The writing itself stays in{' '}
        {storyboardTitle} — it was accepted into someone else&rsquo;s draft and is part of their
        manuscript now. It will be credited to &ldquo;a former contributor&rdquo;.
      </p>
      <p className="mt-2 max-w-measure text-[13px] leading-relaxed text-ink-faint">
        This cannot be undone.
      </p>

      {erase.error ? (
        <p role="alert" className="mt-2 text-[12.5px] text-crimson">
          {erase.error.message}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={erase.isPending}
          onClick={() => erase.mutate({ creditId })}
        >
          {erase.isPending ? 'Erasing…' : 'Erase my name'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Keep my credit
        </Button>
      </div>
    </div>
  )
}
