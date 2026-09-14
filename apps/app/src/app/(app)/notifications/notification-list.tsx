'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import Link from 'next/link'

import { NOTIFICATIONS } from '@/lib/schemas/notifications'
import { useTRPC } from '@/trpc/client'

/** Where a row points, from whatever its payload carries. */
function hrefFor(payload: unknown): string | null {
  const data = (payload ?? {}) as Record<string, unknown>
  const slug = typeof data.slug === 'string' ? data.slug : null
  const requestPublicId = typeof data.requestPublicId === 'string' ? data.requestPublicId : null
  if (slug && requestPublicId) return `/s/${slug}/help/${requestPublicId}`
  if (slug) return `/s/${slug}`
  return null
}

function titleOf(payload: unknown): string | null {
  const data = (payload ?? {}) as Record<string, unknown>
  return typeof data.title === 'string' ? data.title : null
}

export function NotificationList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const { data: notifications } = useSuspenseQuery(
    trpc.notification.list.queryOptions({ take: 50 }),
  )

  const markAllRead = useMutation(
    trpc.notification.markAllRead.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.notification.list.queryKey() })
        await queryClient.invalidateQueries({ queryKey: trpc.notification.unreadCount.queryKey() })
      },
    }),
  )

  const unread = notifications.filter((notification) => notification.readAt === null).length

  if (notifications.length === 0) {
    return (
      <p className="mt-8 border border-rule bg-paper-sunk px-6 py-10 text-center text-[14px] text-ink-soft">
        Nothing yet. When someone helps with your writing, or an author decides on yours, it arrives
        here.
      </p>
    )
  }

  return (
    <div className="mt-6">
      {unread > 0 ? (
        <div className="flex items-center justify-between border-b border-rule pb-3">
          <p role="status" className="text-[13px] text-ink-faint">
            {unread} unread
          </p>
          <Button size="sm" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
            Mark all as read
          </Button>
        </div>
      ) : null}

      <ul className="divide-y divide-rule">
        {notifications.map((notification) => {
          const definition = NOTIFICATIONS[notification.type]
          const href = hrefFor(notification.payload)
          const title = titleOf(notification.payload)
          const isUnread = notification.readAt === null

          const body = (
            <>
              <p className="flex items-baseline gap-2 text-[14px] text-ink">
                {/* Unread is marked by a dot *and* by weight, never colour
                    alone (NFR-4). */}
                {isUnread ? (
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-pencil" />
                ) : (
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0" />
                )}
                <span className={isUnread ? 'font-medium' : undefined}>
                  {definition?.label ?? notification.type}
                  {isUnread ? <span className="sr-only"> (unread)</span> : null}
                </span>
              </p>
              <p className="mt-1 pl-3.5 text-[13px] leading-relaxed text-ink-soft">
                {definition?.sentence}
              </p>
              {title ? (
                <p className="mt-1 pl-3.5 font-manuscript text-[15px] text-ink">{title}</p>
              ) : null}
              <p className="mt-1 pl-3.5 text-[12px] text-ink-faint">
                <time dateTime={notification.createdAt.toISOString()}>
                  {notification.createdAt.toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </p>
            </>
          )

          return (
            <li key={notification.id} className="py-4">
              {href ? (
                <Link href={href} className="-mx-3 block rounded-control px-3 hover:bg-paper-sunk">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
