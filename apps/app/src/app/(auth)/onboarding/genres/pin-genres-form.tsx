'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PINNED_GENRES_MIN } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

export function PinGenresForm() {
  const trpc = useTRPC()
  const router = useRouter()
  const { update } = useSession()
  const { data: genres } = useSuspenseQuery(trpc.user.genres.queryOptions())

  // Selection order is the ranking (FR-11.2), so this is an array, not a set.
  const [picked, setPicked] = useState<string[]>([])

  const pinGenres = useMutation(
    trpc.user.pinGenres.mutationOptions({
      onSuccess: async () => {
        await update({ onboarded: true })
        // FR-1.5: onboarding ends on the dashboard, never on an empty state.
        router.replace('/')
      },
    }),
  )

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )

  const remaining = PINNED_GENRES_MIN - picked.length
  const canSubmit = remaining <= 0 && !pinGenres.isPending

  return (
    <form
      className="mt-8"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) pinGenres.mutate({ genreIds: picked })
      }}
    >
      <fieldset>
        <legend className="sr-only">Genres</legend>
        <ul className="flex flex-wrap gap-2">
          {genres.map((genre) => {
            const rank = picked.indexOf(genre.id)
            const selected = rank !== -1
            return (
              <li key={genre.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggle(genre.id)}
                  className={
                    selected
                      ? 'flex items-center gap-1.5 rounded-control border border-pencil bg-pencil-wash px-3 py-1.5 text-[13.5px] text-pencil'
                      : 'flex items-center gap-1.5 rounded-control border border-rule bg-paper px-3 py-1.5 text-[13.5px] text-ink-soft hover:border-ink-faint'
                  }
                >
                  {selected ? (
                    <span
                      aria-hidden
                      className="flex size-4 items-center justify-center rounded-full bg-pencil text-[10px] font-medium text-white"
                    >
                      {rank + 1}
                    </span>
                  ) : null}
                  {genre.name}
                </button>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <p role="status" className="mt-5 text-[13px] text-ink-faint">
        {remaining > 0
          ? `Pick ${remaining} more.`
          : `${picked.length} picked, in the order you chose them.`}
      </p>

      {pinGenres.isError ? (
        <p role="alert" className="mt-2 text-[13.5px] text-crimson">
          {pinGenres.error.message}
        </p>
      ) : null}

      <Button type="submit" variant="primary" className="mt-5 w-full" disabled={!canSubmit}>
        {pinGenres.isPending ? 'Saving' : 'Finish and go to my dashboard'}
      </Button>
    </form>
  )
}
