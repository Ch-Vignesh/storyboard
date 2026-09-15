'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { useTRPC } from '@/trpc/client'

export function SignUpForm() {
  const trpc = useTRPC()
  const [email, setEmail] = useState('')
  // OD-7 (decision 0020). Held in the form and never sent: the server has no
  // age column, because an age nobody verifies is not worth storing.
  const [oldEnough, setOldEnough] = useState(false)
  const signUp = useMutation(trpc.auth.signUp.mutationOptions())

  if (signUp.isSuccess) {
    return (
      <div className="mt-8 rounded-control border border-moss-wash bg-moss-wash p-4 text-[14px] text-moss">
        {signUp.data.status === 'cooldown'
          ? 'We sent a link a moment ago. Check your inbox, and wait a minute before asking for another.'
          : `Check your inbox. If ${email} can receive email, a confirmation link is on its way.`}
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
      {/* OD-7, decision 0020 — thirteen and over, asked once and not stored.
          A date picker would imply a verification this product does not do. */}
      <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-soft">
        <input
          type="checkbox"
          required
          checked={oldEnough}
          onChange={(event) => setOldEnough(event.target.checked)}
          className="mt-0.5"
        />
        <span>I am 13 or older.</span>
      </label>

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={signUp.isPending || !oldEnough}
      >
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
