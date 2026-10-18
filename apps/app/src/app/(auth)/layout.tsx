import Link from '@/components/link'

import { auth, signOut } from '@/auth'

/**
 * The frame around sign-in, sign-up and onboarding. Phase 14, item 3.6: when
 * somebody is signed in, it says who, and offers the way out. Until then a
 * person signed in with the wrong Google account had to take a permanent
 * username before they could leave, because every other page sent them back
 * to onboarding.
 */
export default async function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth()

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-screen w-full max-w-sm flex-col px-6 py-16"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <Link
          href="/signin"
          className="font-manuscript text-[21px] font-medium tracking-tight text-ink"
        >
          Draftboard
        </Link>
        {session?.user ? (
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/signin' })
            }}
            className="text-[12.5px] text-ink-faint"
          >
            Signed in as {session.user.email ?? 'you'} ·{' '}
            <button type="submit" className="text-ink-soft hover:text-ink hover:underline">
              Sign out
            </button>
          </form>
        ) : null}
      </div>
      <div className="mt-12">{children}</div>
    </main>
  )
}
