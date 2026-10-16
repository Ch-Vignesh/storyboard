'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

import { nameOf } from '@/lib/people'
import { useTRPC } from '@/trpc/client'

type Invitation = {
  id: string
  invitedAt: Date
  invitedBy: { username: string | null; displayName: string | null }
  storyboard: { title: string; logline: string | null; visibility: 'PUBLIC' | 'PRIVATE' }
}

export function InvitationList({ invitations }: { invitations: Invitation[] }) {
  const trpc = useTRPC()
  const router = useRouter()
  const accept = useMutation(
    trpc.coauthor.accept.mutationOptions({ onSuccess: ({ slug }) => router.push(`/s/${slug}`) }),
  )
  const decline = useMutation(
    trpc.coauthor.decline.mutationOptions({ onSuccess: () => router.refresh() }),
  )
  const busy = accept.isPending || decline.isPending

  if (invitations.length === 0) {
    return (
      <p className="mt-8 border border-rule bg-paper-sunk px-6 py-10 text-center text-[14px] text-ink-soft">
        No invitations waiting.
      </p>
    )
  }

  return (
    <>
      <ul className="mt-8 divide-y divide-rule border-y border-rule">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="py-5">
            <p className="font-manuscript text-[19px] text-ink">{invitation.storyboard.title}</p>
            <p className="mt-1 text-[12.5px] text-ink-faint">
              {nameOf(invitation.invitedBy)} asked you to write it with them
              {invitation.storyboard.visibility === 'PRIVATE' ? ' · a private story' : ''}
            </p>
            {invitation.storyboard.logline ? (
              <p className="mt-2 max-w-measure text-[14px] leading-relaxed text-ink-soft">
                {invitation.storyboard.logline}
              </p>
            ) : null}
            <div className="mt-3 flex gap-3">
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => accept.mutate({ invitationId: invitation.id })}
              >
                Become a co-author
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => decline.mutate({ invitationId: invitation.id })}
              >
                No, thank you
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {accept.error || decline.error ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {(accept.error ?? decline.error)?.message}
        </p>
      ) : null}
    </>
  )
}
