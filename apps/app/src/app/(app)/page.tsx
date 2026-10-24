import type { Metadata } from 'next'

import Link from '@/components/link'

import { requireSession } from '@/auth/require-session'
import { readTimeZone } from '@/lib/dates'
import { caller, HydrateClient, prefetch, trpc } from '@/trpc/server'

import { NeedsYouRegion } from './needs-you-region'
import { NewsRegion } from './news-region'
import { OpenRequestsRegion } from './open-requests-region'
import { WritingRegion } from './writing-region'

/**
 * Rendered per request: it reads the session and prefetches through tRPC, both
 * of which need the incoming request. Without this Next tries to prerender it
 * at build time and fails.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Your dashboard' }

/**
 * FR-11.1 — the regions: what needs you (phase 14, item 6.14), storyboards you
 * are writing, requests you have helped with that have news, and open
 * requests in your pinned genres.
 *
 * "Needs you" and the news region show only what is waiting or has moved,
 * never silence, and hide themselves entirely rather than show an empty
 * heading. FR-1.5's "never an empty state" is honoured by the other two: each
 * offers the next action even with nothing in it.
 */
export default async function DashboardPage() {
  await requireSession()
  const timeZone = await readTimeZone()
  prefetch(trpc.request.needsYou.queryOptions())
  prefetch(trpc.storyboard.listMine.queryOptions())
  prefetch(trpc.user.pinnedGenres.queryOptions())
  prefetch(trpc.request.withNews.queryOptions())
  // SRS 3.1 — an invitation to co-author waits here as well as in the
  // notifications, where one is easy to scroll past.
  const invitations = await caller.coauthor.invitations()

  return (
    <HydrateClient>
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
            Your dashboard
          </h1>
          {/* Everything sent, whatever its news: the regions below show only
              what has moved. */}
          <Link href="/suggestions" className="text-[13px] text-pencil hover:underline">
            Your suggestions
          </Link>
        </div>
        <NeedsYouRegion invitations={invitations} timeZone={timeZone} />
        <WritingRegion timeZone={timeZone} />
        <NewsRegion />
        <OpenRequestsRegion timeZone={timeZone} />
      </main>
    </HydrateClient>
  )
}
