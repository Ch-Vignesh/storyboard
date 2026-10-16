'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import Link from '@/components/link'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { useTRPC } from '@/trpc/client'

export function SignUpForm() {
  const trpc = useTRPC()
  const [email, setEmail] = useState('')
  const signUp = useMutation(trpc.auth.signUp.mutationOptions())
  // A message that never came could only be asked for again by signing up
  // again; `resendVerification` had no caller until the 2026-10-16 spec
  // review. Same answers, same cooldown, nothing said about the address.
  const resend = useMutation(trpc.auth.resendVerification.mutationOptions())

  if (signUp.isSuccess) {
    const status = resend.data?.status ?? signUp.data.status
    return (
      <div className="mt-8 space-y-3">
        <div className="rounded-control border border-moss-wash bg-moss-wash p-4 text-[14px] text-moss">
          {status === 'cooldown'
            ? 'We sent a message a moment ago. Check your inbox and your spam folder, and wait a minute before asking for another.'
            : // The same words whether or not the address has an account (FR-1.3).
              // Spam is named because, until the sender has a reputation of its
              // own, that is where a first message often lands.
              `Check your inbox. If ${email} can receive email, a message from Draftboard is on its way: a confirmation link, or a note if the address already has an account. Give it a couple of minutes, and look in spam too.`}
        </div>
        <p className="text-[13px] text-ink-soft">
          Nothing after a few minutes?{' '}
          <button
            type="button"
            className="text-pencil underline-offset-2 hover:underline disabled:text-ink-faint"
            disabled={resend.isPending}
            onClick={() => resend.mutate({ email })}
          >
            {resend.isPending ? 'Sending' : 'Send it again'}
          </button>
        </p>
        {resend.isError ? (
          <p role="alert" className="text-[13px] text-crimson">
            {resend.error.message}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        signUp.mutate({ email })
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={signUp.isError || undefined}
        />
      </div>
      {signUp.isError ? (
        <p role="alert" className="text-[13.5px] text-crimson">
          {signUp.error.message}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={signUp.isPending}>
        {signUp.isPending ? 'Sending' : 'Email me a link'}
      </Button>
      {/* FR-13.4 — the rules, once, where somebody joining will see them. */}
      <p className="text-[12.5px] leading-relaxed text-ink-faint">
        Most of what is here is a draft nobody has published. Before you help with one, read{' '}
        <Link href="/rules" className="text-pencil hover:underline">
          how this place works
        </Link>{' '}
        — six short things, and they are the ones that matter.
      </p>
      {/* Decision 0020 — why the checkbox above is the whole of the policy. */}
      <p className="text-[12.5px] leading-relaxed text-ink-faint">
        There are no private messages here and there never will be. Everything anyone writes to
        anyone is attached to a piece of work and visible to whoever can read it.
      </p>
    </form>
  )
}
