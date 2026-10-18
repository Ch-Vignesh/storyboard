'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { STANDING_NOTE_MAX_CHARS } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

/** Decision 0043 (item 2b.6) — ban a name, and the list of the banned, each with its note. */
export function NamesPanel() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: names, isPending } = useQuery(trpc.admin.bannedNames.queryOptions())

  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.admin.bannedNames.queryKey() })
  }
  const ban = useMutation(
    trpc.admin.banName.mutationOptions({
      onSuccess: async () => {
        setName('')
        setNote('')
        await refresh()
      },
    }),
  )
  const unban = useMutation(trpc.admin.unbanName.mutationOptions({ onSuccess: refresh }))
  const error = ban.error ?? unban.error

  return (
    <section aria-labelledby="names-heading" className="mt-8">
      <h2
        id="names-heading"
        className="text-[12px] font-medium tracking-wide text-ink-faint uppercase"
      >
        Ban a name
      </h2>
      <form
        className="mt-3 max-w-measure space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) ban.mutate({ name: name.trim(), note: note.trim() || undefined })
        }}
      >
        <div>
          <Label htmlFor="ban-name">Username</Label>
          <Input
            id="ban-name"
            className="mt-1"
            value={name}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ban-note">Note, for administrators only</Label>
          <Textarea
            id="ban-note"
            className="mt-1"
            rows={2}
            maxLength={STANDING_NOTE_MAX_CHARS}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={!name.trim() || ban.isPending}>
          Ban this name
        </Button>
      </form>

      <h2 className="mt-10 text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Banned names
      </h2>
      {isPending ? (
        <p className="mt-4 text-[13.5px] text-ink-faint">Reading…</p>
      ) : (names?.length ?? 0) === 0 ? (
        <p className="mt-3 text-[14px] text-ink-soft">No name is banned.</p>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {names?.map((row) => (
            <li key={row.name} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[14px] text-ink">@{row.name}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-faint">
                  Banned{' '}
                  {row.retiredAt.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  {row.note ? ` · ${row.note}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                disabled={unban.isPending || !row.name}
                onClick={() => {
                  if (row.name) unban.mutate({ name: row.name })
                }}
              >
                Lift the ban
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-crimson">
          {error.message}
        </p>
      ) : null}
    </section>
  )
}
