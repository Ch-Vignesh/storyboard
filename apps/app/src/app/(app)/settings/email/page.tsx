import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'

import { EMAIL_CHANGE_LINK_LIFETIME } from '@/lib/email-change'
import { caller } from '@/trpc/server'

import { ConfirmEmailChange } from './confirm-email-change'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Confirm your new address',
  robots: { index: false, follow: false },
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Phase 14, item 3.2 — opened from the link sent to the new address. Works
 * signed out: the link is the authority, and the person may well be reading
 * it on a phone that never signed in. Nothing changes until the button is
 * pressed, because link scanners fetch every GET in an email.
 */
export default async function ConfirmEmailPage({ searchParams }: Props) {
  const { token } = await searchParams
  const tokenValue = typeof token === 'string' ? token : ''

  let newEmail: string | null = null
  let hasPassword = true
  if (tokenValue) {
    try {
      ;({ newEmail, hasPassword } = await caller.auth.checkEmailChange({ token: tokenValue }))
    } catch (caught) {
      if (!(caught instanceof TRPCError)) throw caught
    }
  }

  if (!newEmail) {
    return (
      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">
          This link has expired
        </h1>
        <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
          A link to confirm a new address works for {EMAIL_CHANGE_LINK_LIFETIME} and can be used
          once. Ask for another from your{' '}
          <Link href="/settings" className="text-pencil hover:underline">
            settings
          </Link>
          .
        </p>
      </main>
    )
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">
        Make {newEmail} your address?
      </h1>
      <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
        It becomes the address you sign in with and the one we write to. Every device signed in to
        the account is signed out, and the old address is told.{' '}
        {hasPassword
          ? 'You sign in again with the new address and the same password.'
          : 'This account has no password: sign in again with Google if the new address is a Google account, or choose a password with “Forgot your password?” on the sign-in page.'}
      </p>
      <ConfirmEmailChange token={tokenValue} newEmail={newEmail} />
    </main>
  )
}
