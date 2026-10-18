import type { Metadata } from 'next'
import Link from '@/components/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { ContinueWithGoogle } from '../continue-with-google'
import { safeNext, withNext } from '@/lib/safe-next'
import { signInErrorMessage } from '@/lib/sign-in-error'
import { contactAddress } from '@/lib/site'

import { SignInForm } from './sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function SignInPage({ searchParams }: Props) {
  const { error, code, next, reset, ended } = await searchParams
  // proxy.ts puts the page they were trying to reach here. Validated, because
  // a sign-in page that redirects wherever a URL says is an open redirect.
  const destination = safeNext(next)

  // Item 3.11 — somebody already signed in has nothing to do here.
  if ((await auth())?.user) redirect(destination)

  // A Google sign-in Auth.js refused comes back by the address bar; the form's
  // own failures come back through its action (item 3.4).
  const errorMessage = signInErrorMessage(error, code, contactAddress())

  return (
    <div>
      <h1 className="font-manuscript text-2xl font-medium">Sign in</h1>
      {reset === '1' ? (
        // FR-1.7 — the end of a reset. Every session was signed out by it.
        <p
          role="status"
          className="mt-4 rounded-control border border-moss-wash bg-moss-wash p-3 text-[13.5px] text-moss"
        >
          Your password has been changed. Sign in with the new one.
        </p>
      ) : ended === '1' ? (
        <p role="status" className="mt-4 text-[13.5px] text-ink-soft">
          You have been signed out. Sign in again to carry on.
        </p>
      ) : null}

      <SignInForm next={destination} initialMessage={errorMessage} />

      <ContinueWithGoogle next={next} />

      <p className="mt-8 text-[13.5px] text-ink-soft">
        New here? <Link href={withNext('/signup', destination)}>Create an account</Link>
      </p>
    </div>
  )
}
