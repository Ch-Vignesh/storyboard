'use client'

import { Button } from '@storyboard/ui/components/button'
import { Label } from '@storyboard/ui/components/label'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PasswordInput } from '@/components/password-input'
import { useTRPC } from '@/trpc/client'

export function ResetPasswordForm({ token }: { token: string }) {
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
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput
          id="new-password"
          reveals="new password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setMismatch(false)
          }}
          aria-invalid={reset.isError || undefined}
        />
        <p className="text-[12.5px] text-ink-faint">
          At least 10 characters. A short sentence works well.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Type it again</Label>
        <PasswordInput
          id="confirm-password"
          reveals="the password typed again"
          autoComplete="new-password"
          maxLength={128}
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
