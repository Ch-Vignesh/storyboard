import type { Session } from 'next-auth'

import Link from '@/components/link'
import { UserAvatar } from '@/components/user-avatar'
import { caller } from '@/trpc/server'

import { signOutAction } from './site-header-actions'

/**
 * Phase 14, item 4.1 — the account end of the reader's own header: Browse,
 * who you are, and the way out. The reader keeps its header because a guest
 * may be reading (FR-1.2) and its controls are about the text; this is the
 * part it shares with the site header. A guest gets Browse; the reader's own
 * "Sign in to help" stands beside it.
 */
export async function AccountMenu({ session }: { session: Session | null }) {
  const user = session?.user
  const avatar = user ? await caller.user.avatar().catch(() => null) : null

  return (
    <div className="flex items-center gap-3 text-[13.5px]">
      <Link href="/browse" className="text-ink-soft hover:text-ink">
        Browse
      </Link>
      {user?.username ? (
        <Link
          href={`/@${user.username}`}
          className="inline-flex items-center gap-1.5 text-ink-faint hover:text-ink"
        >
          <UserAvatar person={{ username: user.username, avatar }} size="sm" />@{user.username}
        </Link>
      ) : null}
      {user ? (
        <form action={signOutAction}>
          <button type="submit" className="text-ink-soft hover:text-ink">
            Sign out
          </button>
        </form>
      ) : null}
    </div>
  )
}
