'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import Link from '@/components/link'
import { signIn, signOut } from 'next-auth/react'
import { useState } from 'react'

import { PasswordInput } from '@/components/password-input'
import { PasswordRules } from '@/components/password-rules'
import { PASSWORD_CHARS } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

/**
 * Phase 14, items 3.1 and 3.3 — the password, and the sessions. Changing the
 * password ends every other session (decision 0036); this browser signs in
 * again with the new one behind the scenes, so the person who just changed
 * it is not thrown out by it. "Sign out on every device" includes this one.
 */
export function AccountSecurity() {
  const trpc = useTRPC()
  const { data: settings } = useSuspenseQuery(trpc.settings.get.queryOptions())

  return (
    <section className="mt-14">
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Email address
      </h2>
      <ChangeEmail email={settings.user.email} hasPassword={settings.user.hasPassword} />

      <h2 className="mt-12 text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Password
      </h2>
      {settings.user.hasPassword ? (
        <ChangePassword email={settings.user.email} />
      ) : (
        <p className="mt-3 max-w-measure text-[14px] leading-relaxed text-ink-soft">
          You sign in with Google. To add a password, we&rsquo;ll email you a link:{' '}
          <Link href="/forgot-password" className="text-pencil hover:underline">
            email me a link
          </Link>
          .
        </p>
      )}

      <h2 className="mt-12 text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Sign-in methods
      </h2>
      <SignInMethods
        email={settings.user.email}
        hasPassword={settings.user.hasPassword}
        googleLinkedAt={settings.user.googleLinkedAt}
        googleDisconnectedAt={settings.user.googleDisconnectedAt}
      />

      <h2 className="mt-12 text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Sessions
      </h2>
      <SignOutEverywhere />
    </section>
  )
}

/**
 * Item 3.2 — a new address is confirmed from its own mailbox; nothing changes
 * here but the message. An account with a password gives it; one without has
 * to have signed in lately, and is told so by the server if it has not.
 */
function ChangeEmail({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const trpc = useTRPC()
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const request = useMutation(trpc.settings.requestEmailChange.mutationOptions())

  return (
    <form
      className="mt-4 max-w-sm space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        request.mutate({
          newEmail: newEmail.trim(),
          currentPassword: hasPassword ? currentPassword : undefined,
        })
      }}
    >
      <p className="text-[13.5px] text-ink-soft">
        Now <span className="text-ink">{email}</span>. A link goes to the new address, and nothing
        changes until you open it.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="new-email">New email address</Label>
        <Input
          id="new-email"
          type="email"
          autoComplete="email"
          required
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
        />
      </div>
      {hasPassword ? (
        <div className="space-y-1.5">
          <Label htmlFor="email-current-password">Current password</Label>
          <PasswordInput
            id="email-current-password"
            reveals="current password"
            autoComplete="current-password"
            maxLength={PASSWORD_CHARS.max}
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </div>
      ) : null}
      {request.isError ? (
        <p role="alert" className="text-[13.5px] text-crimson">
          {request.error.message}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={request.isPending || !newEmail.trim()}>
          {request.isPending ? 'Sending' : 'Email me a link'}
        </Button>
      </div>
      {request.isSuccess ? (
        <p role="status" className="text-[13.5px] text-moss">
          We&rsquo;ve sent a link to {request.data.to}. Open it there to finish.
        </p>
      ) : null}
    </form>
  )
}

function ChangePassword({ email }: { email: string }) {
  const trpc = useTRPC()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const change = useMutation(
    trpc.settings.changePassword.mutationOptions({
      onSuccess: async () => {
        // Every other session has just ended (decision 0036). This one signs
        // in again with the new password, so it stays.
        await signIn('credentials', { email, password: next, redirect: false })
        setCurrent('')
        setNext('')
        setConfirm('')
      },
    }),
  )

  return (
    <form
      className="mt-4 max-w-sm space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (next !== confirm) {
          setMismatch(true)
          return
        }
        change.mutate({ current, next, confirm })
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
        <Label htmlFor="current-password">Current password</Label>
        <PasswordInput
          id="current-password"
          reveals="current password"
          autoComplete="current-password"
          maxLength={PASSWORD_CHARS.max}
          required
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          aria-invalid={change.isError || undefined}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="next-password">New password</Label>
        <PasswordInput
          id="next-password"
          reveals="new password"
          autoComplete="new-password"
          maxLength={PASSWORD_CHARS.max}
          required
          value={next}
          onChange={(event) => {
            setNext(event.target.value)
            setMismatch(false)
          }}
          aria-describedby="next-password-rules"
        />
        <PasswordRules id="next-password-rules" value={next} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-next-password">Type it again</Label>
        <PasswordInput
          id="confirm-next-password"
          reveals="the new password typed again"
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
      ) : change.isError ? (
        <p role="alert" className="text-[13.5px] text-crimson">
          {change.error.message}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={change.isPending}>
          {change.isPending ? 'Changing' : 'Change password'}
        </Button>
        <span role="status" aria-live="polite" className="text-[13px] text-moss">
          {change.isSuccess ? 'Changed. Every other device has been signed out.' : ''}
        </span>
      </div>
    </form>
  )
}

function SignOutEverywhere() {
  const trpc = useTRPC()
  const end = useMutation(
    trpc.settings.signOutEverywhere.mutationOptions({
      onSuccess: async () => {
        await signOut({ redirectTo: '/signin?ended=1' })
      },
    }),
  )

  return (
    <div className="mt-3 max-w-measure">
      <p className="text-[14px] leading-relaxed text-ink-soft">
        Signs this account out of every browser and device, this one included. Use it if you left
        yourself signed in somewhere, or if you think somebody else is.
      </p>
      <Button
        type="button"
        variant="ghost"
        className="mt-3"
        disabled={end.isPending}
        onClick={() => end.mutate()}
      >
        {end.isPending ? 'Signing out' : 'Sign out on every device'}
      </Button>
      {end.isError ? (
        <p role="alert" className="mt-2 text-[13px] text-crimson">
          {end.error.message}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Phase 14, item 3.16 — the ways into this account, and the one switch that
 * belongs here. "Disconnect Google" is offered only when a password exists,
 * because without one Google is the only way in; the server refuses it too.
 * Turning Google off also stops a Google account with this address from
 * signing in, which is the point: linking is by address alone.
 */
function SignInMethods({
  email,
  hasPassword,
  googleLinkedAt,
  googleDisconnectedAt,
}: {
  email: string
  hasPassword: boolean
  googleLinkedAt: Date | null
  googleDisconnectedAt: Date | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const setGoogle = useMutation(
    trpc.settings.setGoogleSignIn.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.settings.get.queryFilter()),
    }),
  )
  const day = (date: Date) =>
    date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <dl className="mt-3 space-y-3 text-[13.5px]">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <dt className="w-20 text-ink-faint">Password</dt>
        <dd className="text-ink">
          {hasPassword ? 'Set.' : 'Not set. See Password, above, for a link that sets one.'}
        </dd>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <dt className="w-20 text-ink-faint">Google</dt>
        <dd className="max-w-measure text-ink">
          {googleDisconnectedAt ? (
            <>
              Turned off on {day(googleDisconnectedAt)}. A Google account with {email} cannot sign
              in here until you allow it again.{' '}
              <button
                type="button"
                className="text-pencil hover:underline disabled:text-ink-faint"
                disabled={setGoogle.isPending}
                onClick={() => setGoogle.mutate({ enabled: true })}
              >
                Allow Google sign-in again
              </button>
            </>
          ) : googleLinkedAt ? (
            <>
              Connected since {day(googleLinkedAt)}.{' '}
              {hasPassword ? (
                <button
                  type="button"
                  className="text-pencil hover:underline disabled:text-ink-faint"
                  disabled={setGoogle.isPending}
                  onClick={() => setGoogle.mutate({ enabled: false })}
                >
                  Disconnect Google
                </button>
              ) : (
                <span className="text-ink-soft">
                  Set a password before disconnecting it, or you would have no way in.
                </span>
              )}
            </>
          ) : (
            <>
              Not used yet. Signing in with a Google account for {email} would connect it.{' '}
              {hasPassword ? (
                <button
                  type="button"
                  className="text-pencil hover:underline disabled:text-ink-faint"
                  disabled={setGoogle.isPending}
                  onClick={() => setGoogle.mutate({ enabled: false })}
                >
                  Turn Google sign-in off
                </button>
              ) : null}
            </>
          )}
          {setGoogle.isError ? (
            <span role="alert" className="block text-[13px] text-crimson">
              {setGoogle.error.message}
            </span>
          ) : null}
        </dd>
      </div>
    </dl>
  )
}
