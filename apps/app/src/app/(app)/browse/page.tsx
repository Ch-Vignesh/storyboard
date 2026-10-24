import type { Metadata } from 'next'

import { readTimeZone } from '@/lib/dates'
import { filtersFromParams } from '@/lib/schemas/browse'
import { BROWSE_LIMITS } from '@/lib/schemas/constants'
import { caller } from '@/trpc/server'

import { BrowseFilters } from './browse-filters'
import { RequestResults, StoryResults } from './results'

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
  // Item 6.15 — the cards say when each request closes, in the reader's zone.
  const timeZone = await readTimeZone()
  // Item 9.1 — the stories answer the same search, genres and types.
  const storyInput = { query: filters.query, genreIds: filters.genreIds, types: filters.types }
  const [requests, storyboards, genres] = await Promise.all([
    caller.browse.requests(filters),
    caller.browse.storyboards({ ...storyInput, take: BROWSE_LIMITS.storiesPage }),
    caller.user.genres(),
  ])

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-12">
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
          {/* Item 9.1 — every page, by "Show more", and an honest count of them. */}
          <RequestResults filters={filters} initial={requests} timeZone={timeZone} />
          <StoryResults input={storyInput} initial={storyboards} timeZone={timeZone} />
        </div>
      </div>
    </main>
  )
}
