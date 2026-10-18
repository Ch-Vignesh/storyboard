'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useMutation } from '@tanstack/react-query'
import { useActionState, useState } from 'react'

import Link from '@/components/link'
import { PasswordInput } from '@/components/password-input'
import { useTRPC } from '@/trpc/client'

import { signInAction, type SignInState } from './actions'

const EMPTY: SignInState = { message: null }

/**
 * FR-1.6, phase 14 item 3.4 — the sign-in form. On failure the address stays
 * (the field is controlled, so the form reset that follows an action leaves
 * it alone), and the two ways a right password still fails are named under
 * the form: an address that was never confirmed, and an account that signs
 * in with Google.
 */
export function SignInForm({
  next,
  initialMessage,
}: {
  next: string
  /** A message from the address bar: a Google sign-in Auth.js refused. */
  initialMessage: string | null
}) {
  const [state, formAction, pending] = useActionState(signInAction, EMPTY)
  const [email, setEmail] = useState('')
  const trpc = useTRPC()
  const resend = useMutation(trpc.auth.resendVerification.mutationOptions())
  const [resendNote, setResendNote] = useState<string | null>(null)
  const message = state.message ?? initialMessage

  return (
    <>
      <form action={formAction} className="mt-8 space-y-5">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-[12.5px]">
              Forgot your password?
            </Link>
          </div>
          <PasswordInput id="password" name="password" autoComplete="current-password" required />
        </div>
        {message ? (
          <p role="alert" className="text-[13.5px] text-crimson">
            {message}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? 'Signing in' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-5 space-y-1.5 text-[12.5px] leading-relaxed text-ink-faint">
        <p>
          Never got the confirmation email?{' '}
          <button
            type="button"
            className="text-pencil hover:underline disabled:text-ink-faint"
            disabled={resend.isPending}
            onClick={() => {
              const address = email.trim()
              if (!address) {
                setResendNote('Type your email address above first.')
                return
              }
              setResendNote(null)
              // The same answer whatever the address (FR-1.3): nothing said
              // about who has an account.
              resend.mutate(
                { email: address, next },
                {
                  onSuccess: () =>
                    setResendNote(
                      `If ${address} has an account that is not yet confirmed, a new link is on its way. Look in spam too.`,
                    ),
                  onError: (error) => setResendNote(error.message),
                },
              )
            }}
          >
            Send it again
          </button>
          {resendNote ? <span role="status"> {resendNote}</span> : null}
        </p>
        <p>Signed up with Google? Use Continue with Google below.</p>
      </div>
    </>
  )
}
