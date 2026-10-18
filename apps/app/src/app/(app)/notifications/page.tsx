import type { Metadata } from 'next'

import { requireSession } from '@/auth/require-session'
import { readTimeZone } from '@/lib/dates'
import { HydrateClient, prefetch, trpc } from '@/trpc/server'

import { NotificationList } from './notification-list'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Notifications' }

/**
 * FR-12.1 — the in-app notification centre. In-app delivery cannot be
 * disabled, which is why this page has no "turn these off" control: the email
 * toggles live in settings, and this is the surface that always works.
 */
export default async function NotificationsPage() {
  await requireSession()
  const timeZone = await readTimeZone()
  // Item 6.9 — the first page and the count over every row.
  prefetch(
    trpc.notification.list.infiniteQueryOptions(
      {},
      { getNextPageParam: (page) => page.nextCursor },
    ),
  )
  prefetch(trpc.notification.unreadCount.queryOptions())

  return (
    <HydrateClient>
      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
          Notifications
        </h1>
        <NotificationList timeZone={timeZone} />
      </main>
    </HydrateClient>
  )
}
