import type { Metadata } from 'next'
import Link from '@/components/link'

import { ForgotPasswordForm } from './forgot-password-form'

export const metadata: Metadata = { title: 'Reset your password' }

/** FR-1.7 step one. */
export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="font-manuscript text-2xl font-medium">Reset your password</h1>
      <p className="mt-2 text-[13.5px] text-ink-soft">
        Enter the email you signed up with. We will send you a link to choose a new password.
      </p>
      <ForgotPasswordForm />
      <p className="mt-8 text-[13.5px] text-ink-soft">
        Remembered it? <Link href="/signin">Back to sign in</Link>
      </p>
    </div>
  )
}
