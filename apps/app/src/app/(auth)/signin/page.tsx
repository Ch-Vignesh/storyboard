import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import type { Metadata } from 'next'
import { AuthError } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { signIn } from '@/auth'
import { safeNext } from '@/lib/safe-next'

export const metadata: Metadata = { title: 'Sign in' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function SignInPage({ searchParams }: Props) {
  const { error, next } = await searchParams
  // proxy.ts puts the page they were trying to reach here. Validated, because
  // a sign-in page that redirects wherever a URL says is an open redirect.
  const destination = safeNext(next)

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
        const back = new URLSearchParams({ error: '1' })
        if (destination !== '/') back.set('next', destination)
        redirect(`/signin?${back.toString()}`)
      }
      throw caught
    }
  }

  return (
    <div>
      <h1 className="font-manuscript text-2xl font-medium">Sign in</h1>
      <form action={signInAction} className="mt-8 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {error ? (
          <p role="alert" className="text-[13.5px] text-crimson">
            That email and password do not match. Try again.
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-8 text-[13.5px] text-ink-soft">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </div>
  )
}
