'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'

import Link from '@/components/link'
import { nameOf } from '@/lib/people'
import { formatInZone } from '@/lib/time-zone'
import type { AppRouter } from '@/server/trpc/routers/_app'
import { useTRPC } from '@/trpc/client'

type Invitation = inferRouterOutputs<AppRouter>['coauthor']['invitations'][number]

/**
 * FR-11.1 with the prototype (phase 14, item 6.14) — the first region, for
 * authors: what needs their hand. Suggestions waiting for a decision, the one
 * that has waited longest first, each with Compare; "help me think" requests
 * with ideas and none yet marked as the one that helped; invitations to
 * co-author (SRS 3.1), which waited in a banner here before. Hidden when there
 * is nothing, so a reader who writes nothing never meets an empty heading.
 */
export function NeedsYouRegion({
  invitations,
  timeZone,
}: {
  invitations: Invitation[]
  timeZone: string
}) {
  const trpc = useTRPC()
  const { data } = useSuspenseQuery(trpc.request.needsYou.queryOptions())
  const count = data.suggestions.length + data.requests.length + invitations.length
  if (count === 0) return null

  const chapterOf = (section: { chapter: { order: number } }) =>
    `chapter ${String(section.chapter.order + 1)}`
  const row =
    'flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-3.5 hover:bg-paper-sunk'
  const action = 'shrink-0 text-[13px] text-pencil hover:underline'

  return (
    <section aria-labelledby="needs-you" className="mt-9">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="needs-you"
          className="text-[13px] font-medium tracking-wide text-ink-faint uppercase"
        >
          Needs you
        </h2>
        <p className="text-[12.5px] text-ink-faint">
          {count === 1 ? '1 thing' : `${String(count)} things`}
        </p>
      </div>

      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {data.suggestions.map((suggestion) => (
          <li key={`s-${suggestion.id}`} className={row}>
            <span className="min-w-0">
              <span className="block text-[14.5px] text-ink">
                {nameOf(suggestion.contributor)} sent a suggestion for &ldquo;
                {suggestion.request.title}&rdquo;
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                {suggestion.request.storyboard.title} · {chapterOf(suggestion.request.section)} ·{' '}
                {suggestion.wordCount} words
                {suggestion.submittedAt
                  ? ` · ${formatInZone(suggestion.submittedAt, 'dayMonth', timeZone)}`
                  : ''}
              </span>
            </span>
            <Link
              href={`/s/${suggestion.request.storyboard.slug}/help/${suggestion.request.publicId}/s/${suggestion.publicId}`}
              className={action}
            >
              Compare
            </Link>
          </li>
        ))}
        {data.requests.map((request) => (
          <li key={`r-${request.id}`} className={row}>
            <span className="min-w-0">
              <span className="block text-[14.5px] text-ink">
                &ldquo;{request.title}&rdquo; has{' '}
                {request.ideas === 1 ? 'an idea' : `${String(request.ideas)} ideas`} waiting on your
                word
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                {request.storyboard.title} · {chapterOf(request.section)} · opened{' '}
                {formatInZone(request.createdAt, 'dayMonth', timeZone)}
              </span>
            </span>
            <Link
              href={`/s/${request.storyboard.slug}/help/${request.publicId}`}
              className={action}
            >
              Read them
            </Link>
          </li>
        ))}
        {invitations.map((invitation) => (
          <li key={`i-${invitation.id}`} className={row}>
            <span className="min-w-0">
              <span className="block text-[14.5px] text-ink">
                {nameOf(invitation.invitedBy)} asked you to co-author &ldquo;
                {invitation.storyboard.title}&rdquo;
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                Invitation · {formatInZone(invitation.invitedAt, 'dayMonth', timeZone)}
              </span>
            </span>
            <Link href="/invitations" className={action}>
              Answer
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
