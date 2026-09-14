import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'

import { caller } from '@/trpc/server'

import { SetPasswordForm } from './set-password-form'

export const metadata: Metadata = { title: 'Confirm your email' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function VerifyPage({ searchParams }: Props) {
  const { token } = await searchParams
  const tokenValue = typeof token === 'string' ? token : ''

  let email: string | null = null
  if (tokenValue) {
    try {
      email = (await caller.auth.verifyEmail({ token: tokenValue })).email
    } catch (caught) {
      if (!(caught instanceof TRPCError)) throw caught
    }
  }

  if (!email) {
    return (
      <div>
        <h1 className="font-manuscript text-2xl font-medium">This link has expired</h1>
        <p className="mt-3 text-[14px] text-ink-soft">
          Confirmation links work for 24 hours and can be used once.{' '}
          <Link href="/signup">Request a new one</Link>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-manuscript text-2xl font-medium">Choose a password</h1>
      <p className="mt-2 text-[13.5px] text-ink-soft">
        {email} is confirmed. Set a password to finish creating your account.
      </p>
      <SetPasswordForm token={tokenValue} email={email} />
    </div>
  )
}
