import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import Link from '@/components/link'

import { auth, signOut } from '@/auth'

/**
 * Chrome for the signed-in application. The reader at /s/{slug} has its own
 * layout, because a guest may be looking at it (FR-1.2) and it must not offer
 * them a sign-out button.
 */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth()

  // A session cookie the server has refused: one that signed in before a
  // password reset (decision 0036). The proxy let it through because it never
  // reads the database; this is the first place that can tell, so it sends the
  // person to sign in again instead of rendering the app for nobody. The
  // browser's own session check clears the cookie on the next page.
  if (!session) {
    const cookieStore = await cookies()
    if (cookieStore.getAll().some((cookie) => cookie.name.includes('authjs.session-token'))) {
      redirect('/signin?ended=1')
    }
  }

  return (
    <div className="min-h-screen">
      {/* NFR-4 — the contents rail and the header are a lot to tab past. */}
      <a href="#main" className="skip-link">
        Skip to the main content
      </a>
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <Link
            href="/"
            className="font-manuscript text-[19px] font-medium tracking-tight text-ink"
          >
            Draftboard
          </Link>
          <nav className="flex items-center gap-4 text-[13.5px]">
            <Link href="/browse" className="text-ink-soft hover:text-ink">
              Browse
            </Link>
            <Link href="/new" className="text-pencil hover:underline">
              Start a story
            </Link>
            <Link href="/notifications" className="text-ink-soft hover:text-ink">
              Notifications
            </Link>
            <Link href="/settings" className="text-ink-soft hover:text-ink">
              Settings
            </Link>
            {session?.user.username ? (
              <Link href={`/@${session.user.username}`} className="text-ink-faint hover:text-ink">
                @{session.user.username}
              </Link>
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
      <div id="main">{children}</div>
    </div>
  )
}
