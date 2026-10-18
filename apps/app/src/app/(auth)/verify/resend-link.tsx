'use client'

import { useMutation } from '@tanstack/react-query'

import { useTRPC } from '@/trpc/client'

/**
 * FR-1.4 (phase 14, item 1.16) — a new confirmation link, from an expired one.
 * The address comes from the link that was opened, so there is nothing to
 * type, and the answer is the sign-up form's own: the same words whatever the
 * address, in the same one-minute rhythm.
 */
export function ResendLink({ email, next = '/' }: { email: string; next?: string }) {
  const trpc = useTRPC()
  const resend = useMutation(trpc.auth.resendVerification.mutationOptions())

  if (resend.isSuccess) {
    return (
      <p className="mt-4 rounded-control border border-moss-wash bg-moss-wash p-4 text-[14px] text-moss">
        {resend.data.status === 'cooldown'
          ? 'We sent a message a moment ago. Check your inbox and your spam folder, and wait a minute before asking for another.'
          : `Check your inbox. If ${email} can receive email, a message from Draftboard is on its way. Give it a couple of minutes, and look in spam too.`}
      </p>
    )
  }

  return (
    <p className="mt-4 text-[14px] text-ink-soft">
      <button
        type="button"
        className="text-pencil underline-offset-2 hover:underline disabled:text-ink-faint"
        disabled={resend.isPending}
        onClick={() => resend.mutate({ email, next })}
      >
        {resend.isPending ? 'Sending' : 'Send a new link'}
      </button>{' '}
      to {email}.
      {resend.isError ? (
        <span role="alert" className="block text-[13px] text-crimson">
          {resend.error.message}
        </span>
      ) : null}
    </p>
  )
}
