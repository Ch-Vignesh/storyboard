import Link from 'next/link'

import { auth, signOut } from '@/auth'

/**
 * Chrome for the signed-in application. The reader at /s/{slug} has its own
 * layout, because a guest may be looking at it (FR-1.2) and it must not offer
 * them a sign-out button.
 */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth()

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <Link
            href="/"
            className="font-manuscript text-[19px] font-medium tracking-tight text-ink"
          >
            Storyboard
          </Link>
          <nav className="flex items-center gap-4 text-[13.5px]">
            <Link href="/browse" className="text-ink-soft hover:text-ink">
              Browse
            </Link>
            <Link href="/new" className="text-pencil hover:underline">
              Start a storyboard
            </Link>
            {session?.user.username ? (
              <span className="text-ink-faint">@{session.user.username}</span>
            ) : null}
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/signin' })
              }}
            >
              <button type="submit" className="text-ink-soft hover:text-ink">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      {children}
    </div>
  )
}
