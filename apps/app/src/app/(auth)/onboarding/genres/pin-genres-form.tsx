'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PINNED_GENRES_MIN } from '@/lib/schemas/constants'
import { RULES_SUMMARY } from '@/lib/schemas/onboarding'
import { useTRPC } from '@/trpc/client'

export function PinGenresForm({ next = '/' }: { next?: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const { update } = useSession()
  const { data: genres } = useSuspenseQuery(trpc.user.genres.queryOptions())

  // Selection order is the ranking (FR-11.2), so this is an array, not a set.
  const [picked, setPicked] = useState<string[]>([])
  // FR-13.4 (item 2.3) — the rules, read here, once.
  const [rulesRead, setRulesRead] = useState(false)

  const pinGenres = useMutation(
    trpc.user.pinGenres.mutationOptions({
      onSuccess: async () => {
        await update({ onboarded: true })
        // FR-1.5: onboarding ends on the dashboard, never on an empty state;
        // or, for somebody who came to help (item 3.5), where they were going.
        router.replace(next)
      },
    }),
  )

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )

  const remaining = PINNED_GENRES_MIN - picked.length
  const canSubmit = remaining <= 0 && rulesRead && !pinGenres.isPending

  return (
    <form
      className="mt-8"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) pinGenres.mutate({ genreIds: picked, rulesRead })
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

      {/* FR-13.4 (item 2.3) — the rules, once, where nobody can finish without meeting them. */}
      <section aria-labelledby="rules-heading" className="mt-8 border-l-2 border-rule pl-4">
        <h2 id="rules-heading" className="text-[13.5px] font-medium text-ink">
          How this place works
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
          {RULES_SUMMARY.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
        <p className="mt-2 text-[12.5px] text-ink-faint">
          <a href="/rules" target="_blank" rel="noreferrer" className="text-pencil hover:underline">
            Read the six in full
          </a>
          , in a new tab. Two minutes.
        </p>
        <label className="mt-3 flex items-start gap-2 text-[13.5px] text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={rulesRead}
            onChange={(event) => setRulesRead(event.target.checked)}
          />
          I have read the community rules
        </label>
      </section>

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
