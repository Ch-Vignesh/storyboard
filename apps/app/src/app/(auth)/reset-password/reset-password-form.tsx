'use client'

import { Button } from '@storyboard/ui/components/button'
import { Label } from '@storyboard/ui/components/label'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PasswordInput } from '@/components/password-input'
import { PasswordRules } from '@/components/password-rules'
import { PASSWORD_CHARS } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const reset = useMutation(
    trpc.auth.resetPassword.mutationOptions({
      // Signed out everywhere, this browser included (decision 0036): the
      // next step is signing in with the password just chosen.
      onSuccess: () => router.replace('/signin?reset=1'),
    }),
  )

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        // Checked here so a typo costs nothing, and again on the server.
        if (password !== confirm) {
          setMismatch(true)
          return
        }
        reset.mutate({ token, password, confirm })
      }}
    >
      {/* Item 3.9 — which account this password belongs to, for password managers. */}
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
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput
          id="new-password"
          reveals="new password"
          autoComplete="new-password"
          maxLength={PASSWORD_CHARS.max}
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setMismatch(false)
          }}
          aria-describedby="new-password-rules"
          aria-invalid={reset.isError || undefined}
        />
        <PasswordRules id="new-password-rules" value={password} />
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
      ) : reset.isError ? (
        <p role="alert" className="text-[13.5px] text-crimson">
          {reset.error.message}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={reset.isPending || reset.isSuccess}
      >
        {reset.isPending ? 'Saving' : 'Set new password'}
      </Button>
    </form>
  )
}
