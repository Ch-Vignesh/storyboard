import type { Metadata } from 'next'
import Link from 'next/link'

import { SignUpForm } from './sign-up-form'

export const metadata: Metadata = { title: 'Create an account' }

export default function SignUpPage() {
  return (
    <div>
      <h1 className="font-manuscript text-2xl font-medium">Create an account</h1>
      <p className="mt-2 text-[13.5px] text-ink-soft">
        We will email you a link to confirm your address. Then you choose a password.
      </p>
      <SignUpForm />
      <p className="mt-8 text-[13.5px] text-ink-soft">
        Already have an account? <Link href="/signin">Sign in</Link>
      </p>
    </div>
  )
}
