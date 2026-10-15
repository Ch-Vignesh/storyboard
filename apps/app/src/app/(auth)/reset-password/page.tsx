import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'

import { RESET_LINK_LIFETIME } from '@/lib/password-reset'
import { caller } from '@/trpc/server'

import { ResetPasswordForm } from './reset-password-form'

export const metadata: Metadata = { title: 'Choose a new password' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** FR-1.7 step two, from the emailed link. */
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams
  const tokenValue = typeof token === 'string' ? token : ''

  let email: string | null = null
  if (tokenValue) {
    try {
      email = (await caller.auth.checkPasswordReset({ token: tokenValue })).email
    } catch (caught) {
      if (!(caught instanceof TRPCError)) throw caught
    }
  }

  if (!email) {
    return (
      <div>
        <h1 className="font-manuscript text-2xl font-medium">This link has expired</h1>
        <p className="mt-3 text-[14px] text-ink-soft">
          A reset link works for {RESET_LINK_LIFETIME} and can be used once.{' '}
          <Link href="/forgot-password">Ask for a new one</Link>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-manuscript text-2xl font-medium">Choose a new password</h1>
      <p className="mt-2 text-[13.5px] text-ink-soft">
        For {email}. Every device signed in to this account will be signed out, and you will sign in
        again with the new password.
      </p>
      <ResetPasswordForm token={tokenValue} />
    </div>
  )
}
