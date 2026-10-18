'use client'

import { Button } from '@storyboard/ui/components/button'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'

import Link from '@/components/link'
import { formatInZone } from '@/lib/time-zone'
import type { AppRouter } from '@/server/trpc/routers/_app'
import { useTRPC } from '@/trpc/client'

import { EraseCredit } from './erase-credit'

type Page = inferRouterOutputs<AppRouter>['profile']['credits']

const TYPE_LABELS = {
  PROSE: 'wrote a passage',
  IDEA: 'an idea that helped',
  COAUTHOR: 'co-author',
} as const

/**
 * FR-9.3 — the feed of accepted work, with an excerpt and a link to where it
 * reads (phase 14, item 6.10): the passage itself, with its chapter and
 * section, rather than the story's front page; the request for an idea. A
 * page at a time, newest first; "Show older" fetches the next by its cursor.
 * The first page comes rendered from the server.
 */
export function ContributionFeed({
  username,
  initial,
  isSelf,
  timeZone,
}: {
  username: string
  initial: Page
  /** Decision 0013 — the erase control is offered only to the person it belongs to. */
  isSelf: boolean
  timeZone: string
}) {
  const trpc = useTRPC()
  const feed = useInfiniteQuery(
    trpc.profile.credits.infiniteQueryOptions(
      { username },
      {
        getNextPageParam: (page) => page.nextCursor,
        initialData: { pages: [initial], pageParams: [null] },
      },
    ),
  )
  const credits = (feed.data?.pages ?? [initial]).flatMap((page) => page.items)

  const excerptOf = (text: string | null | undefined) =>
    text && text.length > 160 ? `${text.slice(0, 160).trimEnd()}…` : text

  if (credits.length === 0) {
    return (
      <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
        Nothing yet. Contributions appear here when an author accepts a suggestion, or marks an idea
        as having helped.
      </p>
    )
  }

  return (
    <>
      <ul className="mt-4 space-y-5">
        {credits.map((credit) => (
          <li key={credit.id} className="border-l-2 border-rule py-1 pl-4">
            <p className="text-[13px] text-ink-faint">
              <Link href={credit.where.path} className="text-pencil hover:underline">
                {credit.storyboard.title}
              </Link>
              {credit.where.chapterNumber && credit.where.sectionNumber
                ? ` · chapter ${String(credit.where.chapterNumber)}, section ${String(credit.where.sectionNumber)}`
                : ''}
              {' · '}
              {TYPE_LABELS[credit.type]}
              {' · '}
              <time dateTime={credit.createdAt.toISOString()}>
                {formatInZone(credit.createdAt, 'long', timeZone)}
              </time>
            </p>
            {credit.suggestion?.contentText || credit.idea?.body ? (
              <p className="mt-1.5 max-w-measure font-manuscript text-[15px] leading-relaxed text-ink">
                {excerptOf(credit.suggestion?.contentText ?? credit.idea?.body)}
              </p>
            ) : null}
            {/* Principle 1.3.3 — the record outlives the text. */}
            {!credit.isLive ? (
              <p className="mt-1.5 text-[12.5px] text-ink-faint">
                This writing is no longer in the main draft. The contribution stands.
              </p>
            ) : null}
            {isSelf ? (
              <EraseCredit creditId={credit.id} storyboardTitle={credit.storyboard.title} />
            ) : null}
          </li>
        ))}
      </ul>

      {feed.hasNextPage ? (
        <div className="mt-5">
          <Button
            size="sm"
            disabled={feed.isFetchingNextPage}
            onClick={() => void feed.fetchNextPage()}
          >
            {feed.isFetchingNextPage ? 'Reading' : 'Show older'}
          </Button>
        </div>
      ) : null}
    </>
  )
}
