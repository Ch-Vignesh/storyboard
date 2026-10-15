'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { RESET_LINK_LIFETIME } from '@/lib/password-reset'
import { useTRPC } from '@/trpc/client'

export function ForgotPasswordForm() {
  const trpc = useTRPC()
  const [email, setEmail] = useState('')
  const request = useMutation(trpc.auth.requestPasswordReset.mutationOptions())

  if (request.isSuccess) {
    return (
      <div
        role="status"
        className="mt-8 rounded-control border border-moss-wash bg-moss-wash p-4 text-[14px] text-moss"
      >
        {request.data.status === 'cooldown'
          ? 'We sent a link a moment ago. Check your inbox and your spam folder, and wait a minute before asking for another.'
          : // The same words whether or not the address has an account (FR-1.7).
            `If ${email} has a Draftboard account, a link to choose a new password is on its way. It works for ${RESET_LINK_LIFETIME}. Give it a couple of minutes, and look in spam too.`}
      </div>
    )
  }

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        request.mutate({ email })
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
          aria-invalid={request.isError || undefined}
        />
      </div>
      {request.isError ? (
        <p role="alert" className="text-[13.5px] text-crimson">
          {request.error.message}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={request.isPending}>
        {request.isPending ? 'Sending' : 'Email me a reset link'}
      </Button>
    </form>
  )
}
