import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import type { Metadata } from 'next'
import { AuthError } from 'next-auth'
import Link from '@/components/link'
import { PasswordInput } from '@/components/password-input'
import { redirect } from 'next/navigation'

import { signIn } from '@/auth'
import { ContinueWithGoogle } from '../continue-with-google'
import { safeNext } from '@/lib/safe-next'
import { signInErrorMessage } from '@/lib/sign-in-error'

export const metadata: Metadata = { title: 'Sign in' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function SignInPage({ searchParams }: Props) {
  const { error, next, reset, ended } = await searchParams
  // proxy.ts puts the page they were trying to reach here. Validated, because
  // a sign-in page that redirects wherever a URL says is an open redirect.
  const destination = safeNext(next)
  const errorMessage = signInErrorMessage(error)

  async function signInAction(formData: FormData) {
    'use server'
    try {
      await signIn('credentials', {
        email: formData.get('email'),
        password: formData.get('password'),
        redirectTo: destination,
      })
    } catch (caught) {
      if (caught instanceof AuthError) {
        // The type, not a flag: a refused password and a database that is down
        // both arrive here, and only one of them is the person's to fix.
        const back = new URLSearchParams({ error: caught.type })
        if (destination !== '/') back.set('next', destination)
        redirect(`/signin?${back.toString()}`)
      }
      throw caught
    }
  }

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
      <form action={signInAction} className="mt-8 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-[12.5px]">
              Forgot your password?
            </Link>
          </div>
          <PasswordInput id="password" name="password" autoComplete="current-password" required />
        </div>
        {errorMessage ? (
          <p role="alert" className="text-[13.5px] text-crimson">
            {errorMessage}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full">
          Sign in
        </Button>
      </form>

      <ContinueWithGoogle next={next} />

      <p className="mt-8 text-[13.5px] text-ink-soft">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </div>
  )
}
