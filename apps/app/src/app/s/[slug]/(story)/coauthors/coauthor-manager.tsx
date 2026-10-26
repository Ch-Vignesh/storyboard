'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { nameOf } from '@/lib/people'
import { formatInZone } from '@/lib/time-zone'
import { useTRPC } from '@/trpc/client'

type Coauthor = {
  id: string
  acceptedAt: Date | null
  invitedAt: Date
  user: { id: string; username: string | null; displayName: string | null }
}

export function CoauthorManager({
  storyboardId,
  slug,
  viewerId,
  canInvite,
  max,
  coauthors,
  timeZone,
}: {
  storyboardId: string
  slug: string
  viewerId: string
  canInvite: boolean
  max: number
  coauthors: Coauthor[]
  /** Item 1.18 — the reader's zone, so the server and the browser draw the same day. */
  timeZone: string
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [username, setUsername] = useState('')

  const invite = useMutation(
    trpc.coauthor.invite.mutationOptions({
      onSuccess: () => {
        setUsername('')
        router.refresh()
      },
    }),
  )
  const remove = useMutation(
    trpc.coauthor.remove.mutationOptions({
      // Leaving a private story leaves it unreadable to them: back to their
      // dashboard rather than to a page that is now a 404.
      onSuccess: ({ left }) => (left ? router.push('/') : router.refresh()),
    }),
  )

  const full = coauthors.length >= max

  return (
    <div className="mt-8">
      {coauthors.length === 0 ? (
        <p className="border border-rule bg-paper-sunk px-5 py-6 text-[14px] text-ink-soft">
          Nobody else writes this story yet.
        </p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {coauthors.map((coauthor) => {
            const self = coauthor.user.id === viewerId
            return (
              <li key={coauthor.id} className="flex items-baseline justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="block text-[14.5px] text-ink">
                    {nameOf(coauthor.user)}
                    {coauthor.user.username ? (
                      <span className="text-ink-faint"> @{coauthor.user.username}</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                    {coauthor.acceptedAt
                      ? `Co-author since ${formatInZone(coauthor.acceptedAt, 'long', timeZone)}`
                      : 'Invited, and not yet answered'}
                  </span>
                </span>
                {self ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ invitationId: coauthor.id })}
                  >
                    Leave this story
                  </Button>
                ) : canInvite ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ invitationId: coauthor.id })}
                  >
                    {coauthor.acceptedAt ? 'Remove' : 'Take the invitation back'}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {canInvite ? (
        <form
          className="mt-8 space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (username.trim()) invite.mutate({ storyboardId, username })
          }}
        >
          <Label htmlFor="coauthor-username">Invite a co-author by their username</Label>
          <div className="flex gap-2">
            <Input
              id="coauthor-username"
              value={username}
              placeholder="@username"
              autoComplete="off"
              disabled={full}
              onChange={(event) => setUsername(event.target.value)}
            />
            <Button type="submit" variant="primary" disabled={full || invite.isPending}>
              {invite.isPending ? 'Inviting' : 'Invite'}
            </Button>
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-faint">
            {full
              ? `This story has ${String(max)} co-authors or invitations, which is the most it can have.`
              : 'They are told, and become a co-author when they say yes. Their name goes on the story as a co-author.'}
          </p>
        </form>
      ) : null}

      {invite.error || remove.error ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {(invite.error ?? remove.error)?.message}
        </p>
      ) : null}

      <p className="mt-8 text-[13.5px]">
        <a href={`/s/${slug}`} className="text-pencil hover:underline">
          Back to the story
        </a>
      </p>
    </div>
  )
}
