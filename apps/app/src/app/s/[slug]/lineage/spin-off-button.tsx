'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useTRPC } from '@/trpc/client'

/**
 * FR-10.3 — start your own version of a public storyboard.
 *
 * Two steps rather than one. Copying somebody's manuscript is not a click to be
 * made by accident, and the second step is also where the title is chosen —
 * without it every spin-off would be called the same thing as its original.
 */
export function SpinOffButton({ storyboardId, title }: { storyboardId: string; title: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [newTitle, setNewTitle] = useState(title)

  const create = useMutation(
    trpc.spinOff.create.mutationOptions({
      onSuccess: (spinOff) => router.push(`/s/${spinOff.slug}`),
    }),
  )

  if (!open) {
    return (
      <Button variant="default" size="sm" onClick={() => setOpen(true)}>
        Start my own version
      </Button>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = newTitle.trim()
        if (trimmed.length > 0 && !create.isPending) {
          create.mutate({ storyboardId, title: trimmed })
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="spin-off-title">What will you call yours?</Label>
        <Input
          id="spin-off-title"
          required
          maxLength={200}
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
        />
      </div>

      <p className="text-[12.5px] leading-relaxed text-ink-faint">
        Your version starts private. Everyone credited here stays credited there, and {title} will
        not change because of anything you write.
      </p>

      {create.error ? (
        <p role="alert" className="text-[12.5px] text-crimson">
          {create.error.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={create.isPending}>
          {create.isPending ? 'Copying…' : 'Start my own version'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Not now
        </Button>
      </div>
    </form>
  )
}
