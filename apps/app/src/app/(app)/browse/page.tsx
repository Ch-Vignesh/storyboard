import type { Metadata } from 'next'

import { filtersFromParams } from '@/lib/schemas/browse'
import { caller } from '@/trpc/server'

import { BrowseFilters } from './browse-filters'
import { RequestCard } from './request-card'
import { StoryboardCard } from './storyboard-card'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Browse',
  description: 'Every passage currently open for help.',
}

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Screen 4 — FR-11.3 and FR-11.4.
 *
 * The filters live in the URL, so a view is linkable and the back button does
 * what it looks like it does. Sorting is by a stated rule, never a score
 * (FR-11.2).
 */
export default async function BrowsePage({ searchParams }: Params) {
  const raw = await searchParams
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') params.set(key, value)
    else if (Array.isArray(value)) for (const entry of value) params.append(key, entry)
  }

  const filters = filtersFromParams(params)
  const [{ requests }, storyboards, genres] = await Promise.all([
    caller.browse.requests(filters),
    caller.browse.storyboards({ query: filters.query, genreIds: filters.genreIds, take: 12 }),
    caller.user.genres(),
  ])

  return (
    <main id="main" className="mx-auto max-w-6xl px-6 py-12">
      <header className="max-w-measure">
        <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">
          Where people are stuck
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
          Every passage currently open for help. You never have to read a whole book to be useful —
          each one carries enough of the story to write from.
        </p>
      </header>

      <div className="mt-9 grid gap-10 lg:grid-cols-[15rem_1fr]">
        <BrowseFilters genres={genres} filters={filters} />

        <div className="min-w-0">
          <div className="flex items-baseline justify-between border-b border-rule pb-3">
            <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
              Open for help
            </h2>
            <p role="status" className="text-[12.5px] text-ink-faint">
              {requests.length === 0
                ? 'nothing matches'
                : `${String(requests.length)} ${requests.length === 1 ? 'passage' : 'passages'}`}
            </p>
          </div>

          {requests.length === 0 ? (
            <p className="mt-6 border border-rule bg-paper-sunk px-5 py-12 text-center text-[14px] text-ink-soft">
              Nothing matches those filters. Widening the word range usually helps most.
            </p>
          ) : (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {requests.map((request) => (
                <li key={request.id}>
                  <RequestCard request={request} />
                </li>
              ))}
            </ul>
          )}

          {storyboards.length > 0 ? (
            <section className="mt-14">
              <h2 className="border-b border-rule pb-3 text-[12px] font-medium tracking-wide text-ink-faint uppercase">
                Storyboards you can read
              </h2>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {storyboards.map((storyboard) => (
                  <li key={storyboard.id}>
                    <StoryboardCard storyboard={storyboard} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  )
}
