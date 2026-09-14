import type { Metadata } from 'next'
import Link from 'next/link'

import { REQUEST_KINDS } from '@/lib/schemas/help'
import { STORY_TYPE_LABELS } from '@/lib/schemas/storyboard'
import { caller } from '@/trpc/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Browse' }

/**
 * Screen 4, the part of it phase 2 can honestly show: everything open for help,
 * newest first, and every public storyboard.
 *
 * FR-11.3's filters — genre, type, request kind, word bounds, age, and the
 * "closing soon" and "no answers yet" sorts — are phase 3. This exists now
 * because phase 2 creates requests and a reader needs somewhere to find them
 * that is not their own dashboard.
 */
export default async function BrowsePage() {
  const [requests, storyboards] = await Promise.all([
    caller.request.listOpen({ take: 30 }),
    caller.storyboard.browse({ take: 30 }),
  ])

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
        Where people are stuck
      </h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        Every passage currently open for help. You do not need to read a whole book to be useful —
        each one carries enough of the story to write from.
      </p>

      <section className="mt-9">
        {requests.length === 0 ? (
          <p className="border border-rule bg-paper-sunk px-5 py-10 text-center text-[14px] text-ink-soft">
            Nothing is open for help right now.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {requests.map((request) => {
              const kind = REQUEST_KINDS.find((option) => option.value === request.kind)
              return (
                <li key={request.id}>
                  <Link
                    href={`/s/${request.storyboard.slug}/help/${request.publicId}`}
                    className="block h-full border border-rule bg-paper px-4 py-4 hover:border-ochre hover:bg-ochre-wash/30"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[11.5px] tracking-wide text-ochre uppercase">
                        {kind?.label}
                      </span>
                      {request.storyboard.isSeed ? (
                        <span className="border border-ochre/40 px-1 text-[10.5px] tracking-wide text-ochre uppercase">
                          example
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1.5 block font-manuscript text-[19px] leading-snug text-ink">
                      {request.title}
                    </span>
                    <span className="mt-2 block max-w-measure text-[13px] leading-relaxed text-ink-soft">
                      {request.ask.length > 180 ? `${request.ask.slice(0, 180)}…` : request.ask}
                    </span>
                    <span className="mt-3 block text-[12px] text-ink-faint">
                      {request.storyboard.title} ·{' '}
                      {request.storyboard.owner.displayName ?? request.storyboard.owner.username} ·{' '}
                      {request.kind === 'UNBLOCK'
                        ? `${String(request._count.ideas)} ${request._count.ideas === 1 ? 'idea' : 'ideas'}`
                        : `${String(request._count.suggestions)} ${request._count.suggestions === 1 ? 'suggestion' : 'suggestions'} · ${String(request.minWords)}–${String(request.maxWords)} words`}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="mt-14">
        <h2 className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">
          Storyboards you can read
        </h2>
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {storyboards.map((storyboard) => (
            <li key={storyboard.id}>
              <Link
                href={`/s/${storyboard.slug}`}
                className="flex items-baseline justify-between gap-6 py-3.5 hover:bg-paper-sunk"
              >
                <span className="min-w-0">
                  <span className="block truncate font-manuscript text-[19px] text-ink">
                    {storyboard.title}
                    {storyboard.isSeed ? (
                      <span className="ml-2 border border-ochre/40 px-1 text-[10.5px] tracking-wide text-ochre uppercase">
                        example
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                    {storyboard.owner.displayName ?? storyboard.owner.username} ·{' '}
                    {STORY_TYPE_LABELS[storyboard.type]}
                    {storyboard.genres.length > 0
                      ? ` · ${storyboard.genres.map((entry) => entry.genre.name).join(', ')}`
                      : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
