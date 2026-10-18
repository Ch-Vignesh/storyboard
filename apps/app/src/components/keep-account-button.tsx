'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

import { useTRPC } from '@/trpc/client'

/** The way back from a pending deletion, on the banner (decision 0024). */
export function KeepAccountButton() {
  const trpc = useTRPC()
  const router = useRouter()
  const keep = useMutation(
    trpc.settings.cancelDeletion.mutationOptions({ onSuccess: () => router.refresh() }),
  )

  return (
    <span className="flex items-center gap-3">
      {keep.isError ? (
        <span role="alert" className="text-[13px] text-crimson">
          {keep.error.message}
        </span>
      ) : null}
      <Button size="sm" variant="primary" disabled={keep.isPending} onClick={() => keep.mutate()}>
        {keep.isPending ? 'Keeping it' : 'Keep my account'}
      </Button>
    </span>
  )
}
