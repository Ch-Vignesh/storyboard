'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation, useQuery } from '@tanstack/react-query'
import Link from '@/components/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { allowanceLine, quotaFull, quotaFullLine, type Allowance } from '@/lib/allowance-words'
import { toldSentence } from '@/lib/impact-words'
import { BLOCKED_FROM_HELPING, type RequestKind } from '@/lib/schemas/help'
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
  finished,
  canDecide,
  canContribute,
  signedIn,
  blockedFromHelping = false,
  allowance = null,
}: {
  slug: string
  requestId: string
  requestPublicId: string
  state: 'OPEN' | 'ANSWERED' | 'RESOLVED' | 'CLOSED'
  kind: RequestKind
  /** FR-14.1 — a finished story asks for nothing, so nothing here reopens. */
  finished: boolean
  canDecide: boolean
  canContribute: boolean
  signedIn: boolean
  /** Decision 0046 (item 2.9) — an author blocked this person: the sentence, not the button. */
  blockedFromHelping?: boolean
  /** Item 6.4 — what this person may still send here, beside the button. */
  allowance?: Allowance | null
}) {
  const trpc = useTRPC()
  const router = useRouter()

  const startDraft = useMutation(
    trpc.suggestion.startDraft.mutationOptions({
      onSuccess: () => router.push(`/s/${slug}/help/${requestPublicId}/write`),
    }),
  )
  // Item 5.5 (FR-5.10) — closing asks first, and says who will be told.
  const [confirmClose, setConfirmClose] = useState(false)
  const closeImpact = useQuery({
    ...trpc.request.closeImpact.queryOptions({ requestId }),
    enabled: confirmClose,
  })
  const close = useMutation(
    trpc.request.close.mutationOptions({
      onSuccess: () => {
        setConfirmClose(false)
        router.refresh()
      },
    }),
  )
  const reopen = useMutation(
    trpc.request.reopen.mutationOptions({ onSuccess: () => router.refresh() }),
  )

  const open = state === 'OPEN' || state === 'ANSWERED'
  const wantsProse = kind !== 'UNBLOCK'

  return (
    <div className="mt-10 flex flex-wrap items-center gap-3 border-y border-rule py-4">
      <ConfirmDialog
        open={confirmClose}
        title={wantsProse ? 'Close this without accepting?' : 'Close this request?'}
        confirmLabel="Close it"
        busy={close.isPending || closeImpact.isLoading}
        error={close.error ?? closeImpact.error}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => close.mutate({ requestId })}
      >
        <p>{toldSentence(closeImpact.data?.told, 'with a draft or a waiting suggestion')}</p>
        <p>Nothing is accepted. You can open it again later.</p>
      </ConfirmDialog>
      {open && blockedFromHelping && wantsProse ? (
        <p className="text-[13.5px] text-ink-soft">{BLOCKED_FROM_HELPING}</p>
      ) : null}

      {open && canContribute && wantsProse ? (
        <>
          <Button
            variant="primary"
            disabled={startDraft.isPending}
            onClick={() => startDraft.mutate({ requestId })}
          >
            {startDraft.isPending ? 'Opening' : 'Write a suggestion'}
          </Button>
          {/* Item 6.4 (FR-13.2) — know before you write. A full quota still
              opens a draft; Send waits for a decision. */}
          {allowance ? (
            <p className="text-[12.5px] text-ink-faint">
              {allowanceLine(allowance)}
              {quotaFull(allowance) ? ` ${quotaFullLine(allowance)}` : ''}
            </p>
          ) : null}
        </>
      ) : null}

      {open && !signedIn ? (
        // FR-1.2 — the wall is in front of helping, not reading.
        <Button asChild variant="primary">
          <Link href={`/signin?next=/s/${slug}/help/${requestPublicId}`}>Sign in to help</Link>
        </Button>
      ) : null}

      {canDecide && open ? (
        <Button variant="ghost" disabled={close.isPending} onClick={() => setConfirmClose(true)}>
          {wantsProse ? 'Close this without accepting' : 'Close this request'}
        </Button>
      ) : null}

      {/* FR-5.9 — an author can reopen, and everyone who ever sent something is told. */}
      {canDecide && !open && !finished ? (
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
            ? wantsProse
              ? 'A suggestion was accepted. Everything sent here is still readable.'
              : 'Resolved — an idea helped. Everything posted here is still readable.'
            : finished
              ? 'The story is marked finished, so this is closed. Everything sent here is still readable.'
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
