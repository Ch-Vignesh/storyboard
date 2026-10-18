'use client'

import { Button } from '@storyboard/ui/components/button'
import { Label } from '@storyboard/ui/components/label'
import { useMutation } from '@tanstack/react-query'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

import { PasswordInput } from '@/components/password-input'
import { PasswordRules } from '@/components/password-rules'
import { afterSignIn } from '@/lib/safe-next'
import { PASSWORD_CHARS } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

/**
 * FR-1.3 step 2 — the first password. Item 3.9: the rule is under the field
 * and ticks as it is met, a second field catches a typo before the server
 * does, and a hidden username field tells a password manager which account
 * this password belongs to.
 */
export function SetPasswordForm({
  token,
  email,
  next = '/',
}: {
  token: string
  email: string
  /** Item 3.5 — where they were going; the onboarding steps carry it on. */
  next?: string
}) {
  const trpc = useTRPC()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const setPasswordMutation = useMutation(
    trpc.auth.setPassword.mutationOptions({
      onSuccess: async () => {
        await signIn('credentials', { email, password, redirectTo: afterSignIn(next) })
      },
    }),
  )

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (password !== confirm) {
          setMismatch(true)
          return
        }
        setPasswordMutation.mutate({ token, password })
      }}
    >
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      />
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          maxLength={PASSWORD_CHARS.max}
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setMismatch(false)
          }}
          aria-describedby="password-rules"
          aria-invalid={setPasswordMutation.isError || undefined}
        />
        <PasswordRules id="password-rules" value={password} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Type it again</Label>
        <PasswordInput
          id="confirm-password"
          reveals="the password typed again"
          autoComplete="new-password"
          maxLength={PASSWORD_CHARS.max}
          required
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value)
            setMismatch(false)
          }}
          aria-invalid={mismatch || undefined}
        />
      </div>
      {mismatch ? (
        <p role="alert" className="text-[13.5px] text-crimson">
          The two passwords do not match.
        </p>
      ) : setPasswordMutation.isError ? (
        <p role="alert" className="text-[13.5px] text-crimson">
          {setPasswordMutation.error.message}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={setPasswordMutation.isPending || setPasswordMutation.isSuccess}
      >
        {setPasswordMutation.isPending ? 'Saving' : 'Set password and continue'}
      </Button>
    </form>
  )
}
