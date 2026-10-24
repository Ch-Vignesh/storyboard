import type { Metadata } from 'next'
import Link from '@/components/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { isOn } from '@/lib/flags'
import { safeNext, withNext } from '@/lib/safe-next'

import { ContinueWithGoogle } from '../continue-with-google'

import { SignUpForm } from './sign-up-form'

export const metadata: Metadata = { title: 'Create an account' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function SignUpPage({ searchParams }: Props) {
  const { next } = await searchParams
  // Item 3.5 — where they were going; it rides on the confirmation link.
  const destination = safeNext(next)
  // Item 3.11 — somebody already signed in has nothing to do here.
  if ((await auth())?.user) redirect(destination)
  // Item 9.4 (D-18) — while new accounts are paused, said before anyone types
  // an address. The server refuses a sign-up either way, so a switch that
  // cannot be read here shows the form rather than an error page.
  const paused = await isOn('pause-sign-ups').catch(() => false)

  return (
    <div>
      <h1 className="font-manuscript text-2xl font-medium">Create an account</h1>
      {paused ? (
        <p className="mt-4 border-l-2 border-ochre bg-ochre-wash px-4 py-3 text-[14px] leading-relaxed text-ink">
          Draftboard is not taking new accounts just now. Try again later. If you already have an
          account, sign in as usual.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[13.5px] text-ink-soft">
            We will email you a link to confirm your address. Then you choose a password.
          </p>
          <SignUpForm next={destination} />

          <ContinueWithGoogle next={next} />
        </>
      )}
      <p className="mt-8 text-[13.5px] text-ink-soft">
        Already have an account? <Link href={withNext('/signin', destination)}>Sign in</Link>
      </p>
    </div>
  )
}
