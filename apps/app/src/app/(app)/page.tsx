import type { Metadata } from 'next'

import Link from '@/components/link'

import { requireSession } from '@/auth/require-session'
import { caller, HydrateClient, prefetch, trpc } from '@/trpc/server'

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
export default async function DashboardPage() {
  await requireSession()
  prefetch(trpc.storyboard.listMine.queryOptions())
  prefetch(trpc.user.pinnedGenres.queryOptions())
  prefetch(trpc.request.withNews.queryOptions())
  // SRS 3.1 — an invitation to co-author waits here as well as in the
  // notifications, where one is easy to scroll past.
  const invitations = await caller.coauthor.invitations()

  return (
    <HydrateClient>
      <main className="mx-auto max-w-5xl px-6 py-12">
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
        {invitations.length > 0 ? (
          <p className="mt-6 border-l-2 border-pencil bg-pencil-wash px-4 py-3 text-[14px] text-ink">
            {invitations.length === 1
              ? `You have been asked to co-author “${invitations[0]?.storyboard.title ?? ''}”.`
              : `You have been asked to co-author ${String(invitations.length)} stories.`}{' '}
            <Link href="/invitations" className="text-pencil hover:underline">
              Answer
            </Link>
          </p>
        ) : null}
        <WritingRegion />
        <NewsRegion />
        <OpenRequestsRegion />
      </main>
    </HydrateClient>
  )
}
