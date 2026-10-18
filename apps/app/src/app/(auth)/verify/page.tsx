import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'

import { safeNext } from '@/lib/safe-next'
import { VERIFICATION_TOKEN_TTL_HOURS } from '@/lib/schemas/constants'
import { caller } from '@/trpc/server'

import { ResendLink } from './resend-link'
import { SetPasswordForm } from './set-password-form'

export const metadata: Metadata = { title: 'Confirm your email' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

type Checked = Awaited<ReturnType<typeof caller.auth.verifyEmail>>

export default async function VerifyPage({ searchParams }: Props) {
  const { token, next } = await searchParams
  const tokenValue = typeof token === 'string' ? token : ''
  // Item 3.5 — where they were going when they signed up, from the link.
  const destination = safeNext(next)

  // Nothing for an unknown link; a known one says where its account stands
  // (FR-1.4; phase 14, item 1.16).
  let checked: Checked | null = null
  if (tokenValue) {
    try {
      checked = await caller.auth.verifyEmail({ token: tokenValue })
    } catch (caught) {
      if (!(caught instanceof TRPCError)) throw caught
    }
  }

  // Opened again once the account was finished with it, or with a newer link.
  // A confirmation link never changes a password (decision 0036).
  if (checked?.status === 'finished') {
    return (
      <div>
        <h1 className="font-manuscript text-2xl font-medium">Your account is ready</h1>
        <p className="mt-3 text-[14px] text-ink-soft">
          {checked.email} already has a password. <Link href="/signin">Sign in</Link>, or use{' '}
          <Link href="/forgot-password">Forgot your password?</Link> to change it.
        </p>
      </div>
    )
  }

  // Expired before the account was finished: the address is known, so a new
  // link is one click, with the sign-up form's own answer.
  if (checked?.status === 'expired') {
    return (
      <div>
        <h1 className="font-manuscript text-2xl font-medium">This link has expired</h1>
        <p className="mt-3 text-[14px] text-ink-soft">
          Confirmation links work for {VERIFICATION_TOKEN_TTL_HOURS} hours and can be used once.
        </p>
        <ResendLink email={checked.email} next={destination} />
      </div>
    )
  }

  if (!checked) {
    return (
      <div>
        <h1 className="font-manuscript text-2xl font-medium">This link has expired</h1>
        <p className="mt-3 text-[14px] text-ink-soft">
          Confirmation links work for {VERIFICATION_TOKEN_TTL_HOURS} hours and can be used once.{' '}
          <Link href="/signup">Request a new one</Link>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-manuscript text-2xl font-medium">Choose a password</h1>
      <p className="mt-2 text-[13.5px] text-ink-soft">
        {checked.email} is confirmed. Set a password to finish creating your account.
      </p>
      <SetPasswordForm token={tokenValue} email={checked.email} next={destination} />
    </div>
  )
}
