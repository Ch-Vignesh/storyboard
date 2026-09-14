'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import type { RequestKind } from '@/lib/schemas/help'
import { useTRPC } from '@/trpc/client'

/**
 * What you can do about this request, which depends entirely on who you are:
 * the author decides, a reader helps, a guest is invited to sign in (FR-1.2).
 */
export function RequestActions({
  slug,
  requestId,
  requestPublicId,
  state,
  kind,
  canDecide,
  canContribute,
  signedIn,
}: {
  slug: string
  requestId: string
  requestPublicId: string
  state: 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'CLOSED'
  kind: RequestKind
  canDecide: boolean
  canContribute: boolean
  signedIn: boolean
}) {
  const trpc = useTRPC()
  const router = useRouter()

  const startDraft = useMutation(
    trpc.suggestion.startDraft.mutationOptions({
      onSuccess: () => router.push(`/s/${slug}/help/${requestPublicId}/write`),
    }),
  )
  const close = useMutation(
    trpc.request.close.mutationOptions({ onSuccess: () => router.refresh() }),
  )
  const reopen = useMutation(
    trpc.request.reopen.mutationOptions({ onSuccess: () => router.refresh() }),
  )

  const open = state === 'OPEN' || state === 'ANSWERED'
  const wantsProse = kind !== 'UNBLOCK'

  return (
    <div className="mt-10 flex flex-wrap items-center gap-3 border-y border-rule py-4">
      {open && canContribute && wantsProse ? (
        <Button
          variant="primary"
          disabled={startDraft.isPending}
          onClick={() => startDraft.mutate({ requestId })}
        >
          {startDraft.isPending ? 'Opening' : 'Write a suggestion'}
        </Button>
      ) : null}

      {open && !signedIn ? (
        // FR-1.2 — the wall is in front of helping, not reading.
        <Button asChild variant="primary">
          <Link href={`/signin?next=/s/${slug}/help/${requestPublicId}`}>Sign in to help</Link>
        </Button>
      ) : null}

      {canDecide && open ? (
        <Button
          variant="ghost"
          disabled={close.isPending}
          onClick={() => close.mutate({ requestId })}
        >
          Close this without accepting
        </Button>
      ) : null}

      {/* FR-5.9 — an author can reopen, and everyone who ever sent something is told. */}
      {canDecide && !open ? (
        <Button
          variant="ghost"
          disabled={reopen.isPending}
          onClick={() => reopen.mutate({ requestId })}
        >
          Open it again
        </Button>
      ) : null}

      {!open ? (
        <p className="text-[13px] text-ink-faint">
          {state === 'RESOLVED'
            ? 'A suggestion was accepted. Everything sent here is still readable.'
            : 'This is closed. Everything sent here is still readable.'}
        </p>
      ) : null}

      {startDraft.isError ? (
        <p role="alert" className="text-[13px] text-crimson">
          {startDraft.error.message}
        </p>
      ) : null}
      {close.isError || reopen.isError ? (
        <p role="alert" className="text-[13px] text-crimson">
          {(close.error ?? reopen.error)?.message}
        </p>
      ) : null}
    </div>
  )
}
