import type { Metadata } from 'next'

import { HydrateClient, prefetch, trpc } from '@/trpc/server'

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
 * Phase 1 shipped the first; phase 2 adds the third, now that requests exist.
 * Region two — requests you have helped with that have news — needs the
 * notification work in phase 3 and is absent rather than mocked. FR-1.5's
 * "never an empty state" is honoured by both: each offers the next action even
 * with nothing in it.
 */
export default function DashboardPage() {
  prefetch(trpc.storyboard.listMine.queryOptions())
  prefetch(trpc.user.pinnedGenres.queryOptions())

  return (
    <HydrateClient>
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
          Your dashboard
        </h1>
        <WritingRegion />
        <OpenRequestsRegion />
      </main>
    </HydrateClient>
  )
}
