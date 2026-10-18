'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useTRPC } from '@/trpc/client'

/**
 * Decision 0046 (phase 14, item 2.9; D-9) — "Block" on somebody else's profile.
 * The confirmation says what a block does and does not do, in one breath,
 * because the owner asked that the person blocking be told exactly that.
 */
export function BlockButton({
  userId,
  name,
  blocked,
}: {
  userId: string
  name: string
  blocked: boolean
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const set = useMutation(
    trpc.block.set.mutationOptions({
      onSuccess: () => {
        setConfirming(false)
        router.refresh()
      },
    }),
  )

  if (blocked) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-soft">
        <span>You have blocked {name}.</span>
        <Button
          size="sm"
          variant="ghost"
          disabled={set.isPending}
          onClick={() => set.mutate({ userId, blocked: false })}
        >
          Unblock
        </Button>
        {set.error ? (
          <span role="alert" className="text-crimson">
            {set.error.message}
          </span>
        ) : null}
      </div>
    )
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="text-[13px] text-ink-faint hover:text-ink hover:underline"
        onClick={() => setConfirming(true)}
      >
        Block {name}
      </button>
    )
  }

  return (
    <div className="max-w-measure border-l-2 border-rule py-2 pl-4 text-[13.5px] leading-relaxed text-ink">
      <p>
        They can still read your stories. They can&rsquo;t send you suggestions or ideas, and you
        won&rsquo;t hear from them. What they sent before stays where it is.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button
          size="sm"
          disabled={set.isPending}
          onClick={() => set.mutate({ userId, blocked: true })}
        >
          Block {name}
        </Button>
        <button
          type="button"
          className="text-[13px] text-ink-soft underline hover:text-ink"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
      {set.error ? (
        <p role="alert" className="mt-2 text-[13px] text-crimson">
          {set.error.message}
        </p>
      ) : null}
    </div>
  )
}
