'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useMutation } from '@tanstack/react-query'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

import { useTRPC } from '@/trpc/client'

export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const trpc = useTRPC()
  const [password, setPassword] = useState('')
  const setPasswordMutation = useMutation(
    trpc.auth.setPassword.mutationOptions({
      onSuccess: async () => {
        await signIn('credentials', { email, password, redirectTo: '/' })
      },
    }),
  )

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        setPasswordMutation.mutate({ token, password })
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={setPasswordMutation.isError || undefined}
        />
        <p className="text-[12.5px] text-ink-faint">
          At least 10 characters. A short sentence works well.
        </p>
      </div>
      {setPasswordMutation.isError ? (
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
