'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useTRPC } from '@/trpc/client'

/**
 * FR-15.5 — feature flags.
 *
 * A switch the owner can throw without a deploy. Every flag carries a
 * description because a flag called `new-browse` tells whoever finds it in six
 * months nothing at all, and the person who finds it will be the same person
 * who wrote it.
 */
export function FlagsPanel() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: flags, isPending } = useQuery(trpc.admin.flags.queryOptions())

  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')

  const setFlag = useMutation(
    trpc.admin.setFlag.mutationOptions({
      onSuccess: async () => {
        setKey('')
        setDescription('')
        await queryClient.invalidateQueries({ queryKey: trpc.admin.flags.queryKey() })
      },
    }),
  )

  return (
    <section className="mt-12 border-t border-rule pt-8">
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Feature flags
      </h2>

      {isPending ? (
        <p className="mt-4 text-[13.5px] text-ink-faint">Reading…</p>
      ) : (flags?.length ?? 0) === 0 ? (
        <p className="mt-3 text-[14px] text-ink-soft">No flags. Nothing is being held back.</p>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {flags?.map((flag) => (
            <li key={flag.key} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-[13px] text-ink">{flag.key}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-faint">
                  {flag.description}
                </p>
              </div>
              <Button
                size="sm"
                variant={flag.enabled ? 'accept' : 'default'}
                disabled={setFlag.isPending}
                onClick={() =>
                  setFlag.mutate({
                    key: flag.key,
                    enabled: !flag.enabled,
                    description: flag.description,
                  })
                }
              >
                {flag.enabled ? 'On' : 'Off'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-5 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (key.trim() && description.trim()) {
            setFlag.mutate({ key: key.trim(), enabled: false, description: description.trim() })
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="flag-key">New flag</Label>
          <Input
            id="flag-key"
            value={key}
            maxLength={80}
            onChange={(event) => setKey(event.target.value)}
            placeholder="new-browse"
            className="font-mono"
          />
        </div>
        <div className="min-w-[16rem] flex-1 space-y-1.5">
          <Label htmlFor="flag-description">What it does</Label>
          <Input
            id="flag-description"
            value={description}
            maxLength={300}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="The rebuilt browse screen, behind a switch until the seed is in."
          />
        </div>
        <Button type="submit" size="sm" variant="default" disabled={setFlag.isPending}>
          Add it, off
        </Button>
      </form>

      {setFlag.error ? (
        <p role="alert" className="mt-2 text-[12.5px] text-crimson">
          {setFlag.error.message}
        </p>
      ) : null}
    </section>
  )
}
