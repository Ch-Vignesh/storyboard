import type { Metadata } from 'next'
import Link from '@/components/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
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

  return (
    <div>
      <h1 className="font-manuscript text-2xl font-medium">Create an account</h1>
      <p className="mt-2 text-[13.5px] text-ink-soft">
        We will email you a link to confirm your address. Then you choose a password.
      </p>
      <SignUpForm next={destination} />

      <ContinueWithGoogle next={next} />
      <p className="mt-8 text-[13.5px] text-ink-soft">
        Already have an account? <Link href={withNext('/signin', destination)}>Sign in</Link>
      </p>
    </div>
  )
}
