import { prisma } from '@storyboard/db'
import type { Session } from 'next-auth'

import { auth } from '@/auth'
import { DeletionBanner } from '@/components/deletion-banner'
import Link from '@/components/link'
import { UserAvatar } from '@/components/user-avatar'
import { adminHome } from '@/lib/admin-screens'
import { loadAdminActor } from '@/server/admin-actor'
import { caller } from '@/trpc/server'

import { HeaderMenu } from './header-menu'
import { signOutAction } from './site-header-actions'

/**
 * Phase 14, item 4.1 — the one site header. It used to live in the `(app)`
 * layout alone, so every story sub-page, every profile and the rules page
 * were dead ends with no notifications and no way out. Now it is here, and
 * every layout outside the reader and the auth screens renders it.
 *
 * It reads what it shows: the session, the unread count (FR-12.1), pending
 * invitations, the viewer's picture (item 3.13) and whether they may open
 * the admin panel (decision 0043, cosmetic: every screen refuses on its own).
 * None of that is worth failing a page over, so a refusal shows nothing.
 *
 * A guest gets the wordmark pointing at Browse, which is open to them, and
 * the two ways in. It carries the deletion banner (decision 0024, item 1.5),
 * because "every signed-in page" is exactly where this header is.
 *
 * `session` may be handed in by a layout that already has it, so the lookup
 * behind `auth()` is not made twice for one page.
 */
export async function SiteHeader({ session: given }: { session?: Session | null }) {
  const session = given === undefined ? await auth() : given
  const user = session?.user ?? null

  const [unread, avatar, adminHref, invitations] = user
    ? await Promise.all([
        caller.notification.unreadCount().catch(() => 0),
        caller.user.avatar().catch(() => null),
        loadAdminActor(prisma, user.id)
          .then(adminHome)
          .catch(() => null),
        caller.coauthor
          .invitations()
          .then((rows) => rows.length)
          .catch(() => 0),
      ])
    : [0, null, null, 0]

  return (
    <>
      <header className="relative border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3.5">
          <Link
            // FR-1.2 (item 4.10) — the dashboard needs an account; Browse does not.
            href={user ? '/' : '/browse'}
            className="font-manuscript text-[19px] font-medium tracking-tight text-ink"
          >
            Draftboard
          </Link>
          <nav aria-label="Site" className="flex flex-wrap items-center gap-4 text-[13.5px]">
            {/* Item 4.2 — one "Menu" button below `sm`; a row from there up. */}
            <HeaderMenu>
              <Link href="/browse" className="text-ink-soft hover:text-ink">
                Browse
              </Link>
              {user ? (
                <>
                  <Link href="/new" className="text-pencil hover:underline">
                    Start a story
                  </Link>
                  <Link href="/suggestions" className="text-ink-soft hover:text-ink">
                    Your suggestions
                  </Link>
                  {invitations > 0 ? (
                    <Link href="/invitations" className="text-ink-soft hover:text-ink">
                      Invitations
                      <Badge count={invitations} label="pending" />
                    </Link>
                  ) : null}
                  <Link href="/notifications" className="text-ink-soft hover:text-ink">
                    Notifications
                    {unread > 0 ? <Badge count={unread} label="unread" /> : null}
                  </Link>
                  <Link href="/settings" className="text-ink-soft hover:text-ink">
                    Settings
                  </Link>
                  {adminHref ? (
                    <Link href={adminHref} className="text-ink-soft hover:text-ink">
                      Admin
                    </Link>
                  ) : null}
                  {user.username ? (
                    <Link
                      href={`/@${user.username}`}
                      className="inline-flex items-center gap-1.5 text-ink-faint hover:text-ink"
                    >
                      <UserAvatar person={{ username: user.username, avatar }} size="sm" />@
                      {user.username}
                    </Link>
                  ) : null}
                  <form action={signOutAction}>
                    <button type="submit" className="text-ink-soft hover:text-ink">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                // FR-1.2 — a guest was offered Settings and Sign out here and no
                // way in (2026-10-16 spec review).
                <>
                  <Link href="/signin" className="text-ink-soft hover:text-ink">
                    Sign in
                  </Link>
                  <Link href="/signup" className="text-pencil hover:underline">
                    Create an account
                  </Link>
                </>
              )}
            </HeaderMenu>
          </nav>
        </div>
      </header>
      {/* Decision 0024 — a pending deletion is said on every page (item 1.5). */}
      {user ? <DeletionBanner /> : null}
    </>
  )
}

/** A count beside a link, with its meaning for a screen reader. */
function Badge({ count, label }: { count: number; label: string }) {
  return (
    <span className="ml-1.5 rounded-full bg-pencil px-1.5 py-px text-[11px] text-paper tabular-nums">
      {count > 99 ? '99+' : count}
      <span className="sr-only"> {label}</span>
    </span>
  )
}
