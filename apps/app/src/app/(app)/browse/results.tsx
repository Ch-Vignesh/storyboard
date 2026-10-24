'use client'

import { Button } from '@storyboard/ui/components/button'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'

import type { BrowseFilters } from '@/lib/schemas/browse'
import { BROWSE_LIMITS } from '@/lib/schemas/constants'
import type { AppRouter } from '@/server/trpc/routers/_app'
import { useTRPC } from '@/trpc/client'

import { RequestCard } from './request-card'
import { StoryboardCard } from './storyboard-card'

type Outputs = inferRouterOutputs<AppRouter>['browse']

/**
 * FR-11.3 (phase 14, item 9.1) — the two lists on browse, a page at a time.
 *
 * The first page comes rendered from the server; "Show more" fetches the next
 * by its cursor and adds it below, so nothing already read moves. The count
 * is the server's, over everything the filters match: "Showing 24 of 57", or
 * all of them by number once all are shown. It is a status, so a screen
 * reader hears it change when more arrive.
 */
export function RequestResults({
  filters,
  initial,
  timeZone,
}: {
  filters: BrowseFilters
  initial: Outputs['requests']
  timeZone: string
}) {
  const trpc = useTRPC()
  const list = useInfiniteQuery(
    trpc.browse.requests.infiniteQueryOptions(filters, {
      getNextPageParam: (page) => page.nextCursor,
      initialData: { pages: [initial], pageParams: [null] },
    }),
  )
  const pages = list.data?.pages ?? [initial]
  const requests = pages.flatMap((page) => page.requests)
  const total = pages.at(-1)?.total ?? initial.total

  return (
    <>
      <div className="flex items-baseline justify-between border-b border-rule pb-3">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          Open for help
        </h2>
        <p role="status" className="text-[12.5px] text-ink-faint">
          {count(requests.length, total, ['passage', 'passages'])}
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="mt-6 border border-rule bg-paper-sunk px-5 py-12 text-center text-[14px] text-ink-soft">
          Nothing matches those filters. Widening the word range usually helps most.
        </p>
      ) : (
        <ul aria-label="Passages open for help" className="mt-5 grid gap-4 sm:grid-cols-2">
          {requests.map((request) => (
            <li key={request.id}>
              <RequestCard request={request} timeZone={timeZone} />
            </li>
          ))}
        </ul>
      )}

      <ShowMore
        more={list.hasNextPage ? Math.min(filters.take, total - requests.length) : 0}
        busy={list.isFetchingNextPage}
        failed={list.isFetchNextPageError}
        onClick={() => void list.fetchNextPage()}
        what={['passage', 'passages']}
      />
    </>
  )
}

/** FR-11.4 — the stories, a half page at a time below the requests (item 9.1). */
export function StoryResults({
  input,
  initial,
  timeZone,
}: {
  input: { query?: string; genreIds?: string[]; types?: BrowseFilters['types'] }
  initial: Outputs['storyboards']
  /** Item 7.6 — "last written on", in the reader's zone. */
  timeZone: string
}) {
  const trpc = useTRPC()
  const list = useInfiniteQuery(
    trpc.browse.storyboards.infiniteQueryOptions(
      { ...input, take: BROWSE_LIMITS.storiesPage },
      {
        getNextPageParam: (page) => page.nextCursor,
        initialData: { pages: [initial], pageParams: [null] },
      },
    ),
  )
  const pages = list.data?.pages ?? [initial]
  const storyboards = pages.flatMap((page) => page.storyboards)
  const total = pages.at(-1)?.total ?? initial.total

  if (storyboards.length === 0) return null

  return (
    <section className="mt-14">
      <div className="flex items-baseline justify-between border-b border-rule pb-3">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          Stories you can read
        </h2>
        <p role="status" className="text-[12.5px] text-ink-faint">
          {count(storyboards.length, total, ['story', 'stories'])}
        </p>
      </div>
      <ul aria-label="Stories you can read" className="mt-5 grid gap-4 sm:grid-cols-2">
        {storyboards.map((storyboard) => (
          <li key={storyboard.id}>
            <StoryboardCard storyboard={storyboard} timeZone={timeZone} />
          </li>
        ))}
      </ul>
      <ShowMore
        more={
          list.hasNextPage ? Math.min(BROWSE_LIMITS.storiesPage, total - storyboards.length) : 0
        }
        busy={list.isFetchingNextPage}
        failed={list.isFetchNextPageError}
        onClick={() => void list.fetchNextPage()}
        what={['story', 'stories']}
      />
    </section>
  )
}

/** "Showing 24 of 57" while there is more; the number alone once there is not. */
function count(shown: number, total: number, [one, many]: readonly [string, string]): string {
  if (total === 0) return 'nothing matches'
  if (shown < total) return `Showing ${String(shown)} of ${String(total)}`
  return `${String(total)} ${total === 1 ? one : many}`
}

/** The button names what it fetches: "Show 24 more passages". */
function ShowMore({
  more,
  busy,
  failed,
  onClick,
  what: [one, many],
}: {
  more: number
  busy: boolean
  failed: boolean
  onClick: () => void
  what: readonly [string, string]
}) {
  if (more <= 0) return null
  return (
    <div className="mt-6">
      <Button size="sm" disabled={busy} onClick={onClick}>
        {busy ? 'Reading' : `Show ${String(more)} more ${more === 1 ? one : many}`}
      </Button>
      {failed ? (
        <p role="alert" className="mt-2 text-[13px] text-crimson">
          The next page did not arrive. Try again in a moment.
        </p>
      ) : null}
    </div>
  )
}
