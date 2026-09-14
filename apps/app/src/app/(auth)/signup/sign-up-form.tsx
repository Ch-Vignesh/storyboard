'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { useTRPC } from '@/trpc/client'

export function SignUpForm() {
  const trpc = useTRPC()
  const [email, setEmail] = useState('')
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
      <Button type="submit" variant="primary" className="w-full" disabled={signUp.isPending}>
        {signUp.isPending ? 'Sending' : 'Email me a link'}
      </Button>
    </form>
  )
}
