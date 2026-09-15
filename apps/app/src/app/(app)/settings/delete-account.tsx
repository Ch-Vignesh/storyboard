'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ACCOUNT_DELETION_GRACE_DAYS } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

/**
 * Deleting an account (OD-3's second half, decision 0024).
 *
 * Two things this screen has to do that a confirmation dialog usually does not.
 *
 * It has to say what *stays*, before anybody presses anything. "Delete" implies
 * the writing goes, and here it does not: storyboards, revisions and credits
 * survive, re-attributed to "a former member", because they are not only this
 * person's — somebody else's accepted suggestion is in them and somebody else's
 * credit is on them. Somebody who would not have deleted had they known that
 * must find it out here rather than afterwards.
 *
 * And it has to be hard enough to be deliberate without being theatre. Typing
 * the username is the usual answer and it is a good one: it cannot be done by
 * a mis-click, a stray keyboard shortcut, or a page that reloaded under
 * somebody's finger, and it takes about four seconds when you mean it.
 */
export function DeleteAccount({
  username,
  deletionRequestedAt,
}: {
  username: string | null
  deletionRequestedAt: Date | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')

  const refetch = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.settings.get.queryKey() })
  }

  const request = useMutation(
    trpc.settings.requestDeletion.mutationOptions({
      onSuccess: async () => {
        setOpen(false)
        setTyped('')
        await refetch()
      },
    }),
  )
  const cancel = useMutation(trpc.settings.cancelDeletion.mutationOptions({ onSuccess: refetch }))

  if (deletionRequestedAt) {
    const finishesAt = new Date(
      deletionRequestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
    )
    return (
      <section>
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          This account is being deleted
        </h2>
        <div className="border-ochre-edge mt-3 border bg-ochre-wash p-4">
          <p className="max-w-measure text-[14px] leading-relaxed text-ink">
            It will be erased on{' '}
            <strong className="font-medium">
              {finishesAt.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </strong>
            . Until then you can read, and you cannot write. Your profile is already hidden.
          </p>
          <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
            If you did not do this, somebody else is in your account. Stop the deletion and change
            your password.
          </p>
          <Button
            variant="primary"
            className="mt-4"
            disabled={cancel.isPending}
            onClick={() => {
              cancel.mutate()
            }}
          >
            {cancel.isPending ? 'Stopping' : 'Stop the deletion'}
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Delete this account
      </h2>

      {!open ? (
        <>
          <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
            Your name and everything that identifies you is erased after{' '}
            {ACCOUNT_DELETION_GRACE_DAYS} days. The writing stays.
          </p>
          <button
            type="button"
            className="mt-3 text-[13.5px] text-crimson underline underline-offset-2"
            onClick={() => {
              setOpen(true)
            }}
          >
            Delete my account
          </button>
        </>
      ) : (
        <div className="mt-3 border border-rule p-4">
          <p className="max-w-measure text-[14px] leading-relaxed text-ink">
            Deleting your account erases you, not your writing. This is the part worth reading
            before you decide.
          </p>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[13.5px] leading-relaxed">
            <dt className="text-crimson">Erased</dt>
            <dd className="text-ink-soft">
              Your name, username, email, biography, picture and password. Your notifications, your
              reading settings, and any manuscript you uploaded but never turned into a storyboard.
            </dd>
            <dt className="text-moss">Kept</dt>
            <dd className="text-ink-soft">
              Every storyboard you own, every revision you wrote and every credit you hold — shown
              as <span className="italic">a former member</span>. Other people have contributed to
              your work and been credited on it, and that is theirs as much as yours.
            </dd>
          </dl>

          <p className="mt-4 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
            If what you want is a manuscript gone rather than an account, this will not do it.
            Delete the storyboard first — it goes for good after thirty days — and then come back
            here. They are different things and only one of them is what this button is for.
          </p>

          <p className="mt-3 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
            Nothing happens for {ACCOUNT_DELETION_GRACE_DAYS} days. You can sign in and stop it
            until then; afterwards there is no way back, because there will be nothing to sign in
            with.
          </p>

          <div className="mt-5 max-w-sm">
            <label htmlFor="confirm-username" className="text-[13.5px] text-ink">
              Type <strong className="font-medium">{username ?? 'your username'}</strong> to confirm
            </label>
            <Input
              id="confirm-username"
              value={typed}
              autoComplete="off"
              className="mt-1.5"
              onChange={(event) => {
                setTyped(event.target.value)
              }}
            />
          </div>

          {request.error ? (
            <p className="mt-3 text-[13px] text-crimson">{request.error.message}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={typed !== username || request.isPending}
              onClick={() => {
                request.mutate()
              }}
            >
              {request.isPending ? 'Starting' : 'Delete my account'}
            </Button>
            <button
              type="button"
              className="text-[13.5px]"
              onClick={() => {
                setOpen(false)
                setTyped('')
              }}
            >
              Keep my account
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
