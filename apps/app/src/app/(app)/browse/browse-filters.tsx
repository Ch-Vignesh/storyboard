'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

import {
  AGE_FILTERS,
  BROWSE_SORTS,
  paramsFromFilters,
  type BrowseFilters as Filters,
} from '@/lib/schemas/browse'
import { SUGGESTION_WORDS } from '@/lib/schemas/constants'
import { REQUEST_KINDS } from '@/lib/schemas/help'
import { STORY_TYPES } from '@/lib/schemas/storyboard'

type Genre = { id: string; slug: string; name: string }

/**
 * FR-11.3 — the filters, written into the URL so a view can be linked, shared
 * and gone back to.
 *
 * A fieldset per concern, every control labelled, and no filter that means
 * anything other than what it says. There is no relevance slider here because
 * there is no relevance model (FR-11.2).
 */
export function BrowseFilters({ genres, filters }: { genres: Genre[]; filters: Filters }) {
  const router = useRouter()
  const search = useSearchParams()
  const [query, setQuery] = useState(filters.query ?? '')

  /** Writes the next filter state into the URL; the server re-renders from it. */
  function apply(next: Partial<Filters>) {
    const merged = { ...filters, ...next }
    const params = paramsFromFilters(merged)
    router.push(params.toString() ? `/browse?${params.toString()}` : '/browse')
  }

  const toggle = <T extends string>(list: readonly T[] | undefined, value: T): T[] => {
    const current = list ?? []
    return current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value]
  }

  const active =
    (filters.query ? 1 : 0) +
    (filters.genreIds?.length ?? 0) +
    (filters.types?.length ?? 0) +
    (filters.kinds?.length ?? 0) +
    (filters.minWords === undefined ? 0 : 1) +
    (filters.maxWords === undefined ? 0 : 1) +
    (filters.age === 'ANY' ? 0 : 1)

  return (
    <aside className="lg:sticky lg:top-8 lg:self-start">
      <form
        className="space-y-7"
        onSubmit={(event) => {
          event.preventDefault()
          apply({ query: query.trim() || undefined })
        }}
      >
        {/* FR-11.6 — title and author name only, and the label says so. */}
        <div className="space-y-1.5">
          <label htmlFor="browse-search" className="text-[13.5px] font-medium text-ink">
            Search
          </label>
          <div className="flex gap-2">
            <Input
              id="browse-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title or author"
              aria-describedby="browse-search-hint"
            />
            <Button type="submit" size="md">
              Go
            </Button>
          </div>
          <p id="browse-search-hint" className="text-[12px] leading-relaxed text-ink-faint">
            Titles and author names. Manuscripts are not searched — that is unpublished work.
          </p>
        </div>

        <fieldset>
          <legend className="text-[13.5px] font-medium text-ink">Order</legend>
          <ul className="mt-2 space-y-1.5">
            {BROWSE_SORTS.map((sort) => (
              <li key={sort.value}>
                <label className="flex items-start gap-2.5 text-[13.5px] text-ink-soft">
                  <input
                    type="radio"
                    name="sort"
                    className="mt-1 size-4 shrink-0 accent-pencil"
                    checked={filters.sort === sort.value}
                    onChange={() => apply({ sort: sort.value })}
                  />
                  <span>
                    <span className="block text-ink">{sort.label}</span>
                    <span className="block text-[12px] text-ink-faint">{sort.blurb}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <fieldset>
          <legend className="text-[13.5px] font-medium text-ink">What they want</legend>
          <ul className="mt-2 space-y-1.5">
            {REQUEST_KINDS.map((kind) => (
              <li key={kind.value}>
                <label className="flex items-center gap-2.5 text-[13.5px] text-ink-soft">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-pencil"
                    checked={filters.kinds?.includes(kind.value) ?? false}
                    onChange={() => apply({ kinds: toggle(filters.kinds, kind.value) })}
                  />
                  {kind.label}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <fieldset>
          <legend className="text-[13.5px] font-medium text-ink">How long</legend>
          <div className="mt-2 flex items-end gap-2">
            <div className="space-y-1">
              <label htmlFor="min-words" className="block text-[12px] text-ink-faint">
                From
              </label>
              <Input
                id="min-words"
                type="number"
                className="w-24"
                min={SUGGESTION_WORDS.floor}
                max={SUGGESTION_WORDS.ceiling}
                defaultValue={filters.minWords}
                onBlur={(event) =>
                  apply({ minWords: event.target.value ? Number(event.target.value) : undefined })
                }
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="max-words" className="block text-[12px] text-ink-faint">
                To
              </label>
              <Input
                id="max-words"
                type="number"
                className="w-24"
                min={SUGGESTION_WORDS.floor}
                max={SUGGESTION_WORDS.ceiling}
                defaultValue={filters.maxWords}
                onBlur={(event) =>
                  apply({ maxWords: event.target.value ? Number(event.target.value) : undefined })
                }
              />
            </div>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-faint">Words the author is asking for.</p>
        </fieldset>

        <fieldset>
          <legend className="text-[13.5px] font-medium text-ink">Opened</legend>
          <ul className="mt-2 flex flex-wrap gap-2">
            {AGE_FILTERS.map((age) => (
              <li key={age.value}>
                <button
                  type="button"
                  aria-pressed={filters.age === age.value}
                  onClick={() => apply({ age: age.value })}
                  className={
                    filters.age === age.value
                      ? 'min-h-9 rounded-control border border-pencil bg-pencil-wash px-3 py-1.5 text-[13px] text-pencil'
                      : 'min-h-9 rounded-control border border-rule bg-paper px-3 py-1.5 text-[13px] text-ink-soft hover:border-ink-faint'
                  }
                >
                  {age.label}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>

        <fieldset>
          <legend className="text-[13.5px] font-medium text-ink">Genre</legend>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {genres.map((genre) => {
              const selected = filters.genreIds?.includes(genre.id) ?? false
              return (
                <li key={genre.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => apply({ genreIds: toggle(filters.genreIds, genre.id) })}
                    className={
                      selected
                        ? 'min-h-8 rounded-control border border-pencil bg-pencil-wash px-2.5 py-1 text-[12.5px] text-pencil'
                        : 'min-h-8 rounded-control border border-rule bg-paper px-2.5 py-1 text-[12.5px] text-ink-soft hover:border-ink-faint'
                    }
                  >
                    {genre.name}
                  </button>
                </li>
              )
            })}
          </ul>
        </fieldset>

        <fieldset>
          <legend className="text-[13.5px] font-medium text-ink">Kind of story</legend>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {STORY_TYPES.map((type) => {
              const selected = filters.types?.includes(type.value) ?? false
              return (
                <li key={type.value}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => apply({ types: toggle(filters.types, type.value) })}
                    className={
                      selected
                        ? 'min-h-8 rounded-control border border-pencil bg-pencil-wash px-2.5 py-1 text-[12.5px] text-pencil'
                        : 'min-h-8 rounded-control border border-rule bg-paper px-2.5 py-1 text-[12.5px] text-ink-soft hover:border-ink-faint'
                    }
                  >
                    {type.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </fieldset>

        {active > 0 ? (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery('')
              router.push('/browse')
            }}
          >
            Clear {active} {active === 1 ? 'filter' : 'filters'}
          </Button>
        ) : null}
      </form>
      <p className="sr-only" aria-live="polite">
        {search.toString() ? 'Filters applied.' : 'No filters applied.'}
      </p>
    </aside>
  )
}
