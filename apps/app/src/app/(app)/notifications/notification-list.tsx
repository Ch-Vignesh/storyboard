'use client'

import { Button } from '@storyboard/ui/components/button'
import {
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import type { MouseEvent } from 'react'

import Link from '@/components/link'
import { NOTIFICATIONS } from '@/lib/schemas/notifications'
import { ExampleLabel } from '@/components/example-label'
import { formatInZone } from '@/lib/time-zone'
import { useTRPC } from '@/trpc/client'

/**
 * FR-12.1 — the rows, newest first, a page at a time (phase 14, item 6.9).
 * Opening a row marks it read and then goes where it leads; "Show older"
 * fetches the next page by its cursor; the unread count is the server's, over
 * every row and not only the ones on the screen; and each row says who did
 * what, in words worked out on the server against what this person may read.
 * Dates are in the zone the account keeps (item 1.18).
 */
export function NotificationList({ timeZone }: { timeZone: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const router = useRouter()

  const list = useSuspenseInfiniteQuery(
    trpc.notification.list.infiniteQueryOptions(
      {},
      { getNextPageParam: (page) => page.nextCursor },
    ),
  )
  const { data: unread } = useSuspenseQuery(trpc.notification.unreadCount.queryOptions())
  const notifications = list.data.pages.flatMap((page) => page.items)

  // The list and the count here, and the header's count, which the server reads.
  const settle = () => {
    // `pathKey`: the list is an infinite query, which `queryKey()` (a plain
    // query's key) never matched, so marking read left the list as it was.
    void queryClient.invalidateQueries({ queryKey: trpc.notification.list.pathKey() })
    void queryClient.invalidateQueries({ queryKey: trpc.notification.unreadCount.queryKey() })
    router.refresh()
  }
  const markAllRead = useMutation(
    trpc.notification.markAllRead.mutationOptions({ onSuccess: settle }),
  )
  const markRead = useMutation(trpc.notification.markRead.mutationOptions({ onSuccess: settle }))

  /** Read first, then there. A click meant for a new tab is left to the browser. */
  function open(event: MouseEvent<HTMLAnchorElement>, id: string, href: string, isUnread: boolean) {
    if (!isUnread) return
    const plain =
      event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    if (!plain) {
      markRead.mutate({ ids: [id] })
      return
    }
    event.preventDefault()
    markRead.mutate({ ids: [id] }, { onSettled: () => router.push(href) })
  }

  if (notifications.length === 0) {
    return (
      <p className="mt-8 border border-rule bg-paper-sunk px-6 py-10 text-center text-[14px] text-ink-soft">
        Nothing yet. When someone helps with your writing, or an author decides on yours, it arrives
        here.
      </p>
    )
  }

  const failure = markAllRead.error ?? markRead.error

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
      {/* It failed without a word until the phase 12 audit. */}
      {failure ? (
        <p role="alert" className="mt-2 text-[13px] text-crimson">
          {failure.message}
        </p>
      ) : null}

      <ul className="divide-y divide-rule">
        {notifications.map((notification) => {
          const definition = NOTIFICATIONS[notification.type]
          // Resolved on the server, against what this person may read now.
          const href = notification.path
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
                  {definition.label}
                  {isUnread ? <span className="sr-only"> (unread)</span> : null}
                </span>
              </p>
              <p className="mt-1 pl-3.5 text-[13px] leading-relaxed text-ink-soft">
                {notification.sentence}
              </p>
              {notification.title ? (
                <p className="mt-1 pl-3.5 font-manuscript text-[15px] text-ink">
                  {notification.title}
                  {/* FR-15.3 (item 7.7) */}
                  {notification.example ? <ExampleLabel className="ml-2" /> : null}
                </p>
              ) : null}
              <p className="mt-1 pl-3.5 text-[12px] text-ink-faint">
                <time dateTime={notification.createdAt.toISOString()}>
                  {formatInZone(notification.createdAt, 'dateTime', timeZone)}
                </time>
              </p>
            </>
          )

          return (
            <li key={notification.id} className="py-4">
              {href ? (
                <Link
                  href={href}
                  onClick={(event) => open(event, notification.id, href, isUnread)}
                  className="-mx-3 block rounded-control px-3 hover:bg-paper-sunk"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div>{body}</div>
                  {isUnread ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={markRead.isPending}
                      onClick={() => markRead.mutate({ ids: [notification.id] })}
                    >
                      Mark as read
                    </Button>
                  ) : null}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {list.hasNextPage ? (
        <div className="mt-6">
          <Button
            size="sm"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? 'Reading' : 'Show older'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
