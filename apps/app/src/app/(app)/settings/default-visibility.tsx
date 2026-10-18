'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { VISIBILITY_COPY } from '@/lib/schemas/storyboard'
import { useTRPC } from '@/trpc/client'

type Visibility = 'PUBLIC' | 'PRIVATE'

/**
 * Phase 14, item 3.15 (screen 16) — what a new story starts as. The create
 * form and the import begin from this and still show FR-13.6's words beside
 * the choice, so nothing here decides a story's visibility: it decides which
 * option is already selected when the person gets there.
 */
export function DefaultVisibility({ value }: { value: Visibility }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [chosen, setChosen] = useState<Visibility>(value)
  const save = useMutation(
    trpc.settings.setDefaultVisibility.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.settings.get.queryFilter()),
    }),
  )

  return (
    <fieldset className="mt-8">
      <legend className="text-[13.5px] text-ink">New stories start as</legend>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {(['PUBLIC', 'PRIVATE'] as const).map((option) => {
          const copy = option === 'PUBLIC' ? VISIBILITY_COPY.public : VISIBILITY_COPY.private
          return (
            <label key={option} className="flex items-start gap-2 text-[13.5px] text-ink">
              <input
                type="radio"
                name="default-visibility"
                className="mt-1 accent-pencil"
                checked={chosen === option}
                disabled={save.isPending}
                onChange={() => {
                  setChosen(option)
                  save.mutate({ visibility: option })
                }}
              />
              <span>
                {copy.label}
                <span className="block text-[12.5px] text-ink-faint">{copy.summary}</span>
              </span>
            </label>
          )
        })}
      </div>
      <p className="mt-2 text-[12.5px] text-ink-faint">
        You still choose for each story when you start it; this is only which option is already
        selected.{' '}
        <span role="status" aria-live="polite" className="text-moss">
          {save.isSuccess ? 'Saved.' : ''}
        </span>
        {save.isError ? <span className="text-crimson">{save.error.message}</span> : null}
      </p>
    </fieldset>
  )
}
