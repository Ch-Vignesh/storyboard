import Link from '@/components/link'

import { auth, signOut } from '@/auth'
import { redirectIfSessionEnded } from '@/auth/require-session'
import { caller } from '@/trpc/server'

/**
 * Chrome for the signed-in application. The reader at /s/{slug} has its own
 * layout, because a guest may be looking at it (FR-1.2) and it must not offer
 * them a sign-out button.
 */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth()

  // A session the server has refused goes to sign in again. The browser's own
  // session check clears the cookie on the next page.
  await redirectIfSessionEnded(session)

  // FR-12.1 — how many are waiting, beside the link to them. The count was
  // served and never shown until the 2026-10-16 spec review. A header is not
  // worth failing a page over, so a refusal shows no count.
  const unread = session ? await caller.notification.unreadCount().catch(() => 0) : 0

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
            {session ? (
              <>
                <Link href="/new" className="text-pencil hover:underline">
                  Start a story
                </Link>
                <Link href="/notifications" className="text-ink-soft hover:text-ink">
                  Notifications
                  {unread > 0 ? (
                    <span className="ml-1.5 rounded-full bg-pencil px-1.5 py-px text-[11px] text-paper tabular-nums">
                      {unread > 99 ? '99+' : unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  ) : null}
                </Link>
                <Link href="/settings" className="text-ink-soft hover:text-ink">
                  Settings
                </Link>
                {session.user.username ? (
                  <Link
                    href={`/@${session.user.username}`}
                    className="text-ink-faint hover:text-ink"
                  >
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
              </>
            ) : (
              // FR-1.2 — /browse is open to a guest, who was offered Settings
              // and Sign out here and no way in (2026-10-16 spec review).
              <>
                <Link href="/signin" className="text-ink-soft hover:text-ink">
                  Sign in
                </Link>
                <Link href="/signup" className="text-pencil hover:underline">
                  Create an account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <div id="main">{children}</div>
    </div>
  )
}
