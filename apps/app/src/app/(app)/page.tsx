import type { Metadata } from 'next'

import { HydrateClient, prefetch, trpc } from '@/trpc/server'

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
 * FR-11.1 — three regions: storyboards you are writing, requests you have
 * helped with that have news, and open requests in your pinned genres.
 *
 * All three are here as of phase 3. Region two only shows decisions and
 * movement, never silence. FR-1.5's "never an empty state" is honoured by the
 * first and third: each offers the next action even with nothing in it, and
 * region two hides itself entirely when there is no news rather than showing an
 * empty heading.
 */
export default function DashboardPage() {
  prefetch(trpc.storyboard.listMine.queryOptions())
  prefetch(trpc.user.pinnedGenres.queryOptions())
  prefetch(trpc.request.withNews.queryOptions())

  return (
    <HydrateClient>
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
          Your dashboard
        </h1>
        <WritingRegion />
        <NewsRegion />
        <OpenRequestsRegion />
      </main>
    </HydrateClient>
  )
}
