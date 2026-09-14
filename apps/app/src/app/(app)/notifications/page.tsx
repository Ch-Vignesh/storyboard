import type { Metadata } from 'next'

import { HydrateClient, prefetch, trpc } from '@/trpc/server'

import { NotificationList } from './notification-list'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Notifications' }

/**
 * FR-12.1 — the in-app notification centre. In-app delivery cannot be
 * disabled, which is why this page has no "turn these off" control: the email
 * toggles live in settings, and this is the surface that always works.
 */
export default function NotificationsPage() {
  prefetch(trpc.notification.list.queryOptions({ take: 50 }))

  return (
    <HydrateClient>
      <main id="main" className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
          Notifications
        </h1>
        <NotificationList />
      </main>
    </HydrateClient>
  )
}
